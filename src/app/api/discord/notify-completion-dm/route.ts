import { siteConfig } from '@/lib/site-config';
/**
 * Discord Task Completion DM API
 * Sends DMs to volunteers when they complete a task
 */
import { NextRequest, NextResponse } from 'next/server';
import PocketBase from 'pocketbase';
import { sendDirectMessage, formatTaskCompletion } from '@/lib/discord';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskId, taskData, volunteerIds, actualMinutes } = body;

    if (!volunteerIds || volunteerIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No volunteer IDs provided' },
        { status: 400 }
      );
    }

    // Connect to PocketBase to get volunteer Discord IDs
    const pb = new PocketBase(process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090');
    
    await pb.admins.authWithPassword(
      process.env.POCKETBASE_ADMIN_EMAIL!,
      process.env.POCKETBASE_ADMIN_PASSWORD!
    );

    // Build task URL
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const taskUrl = `${baseUrl}/task/${taskId}`;

    const results = [];
    
    // Send DM to each volunteer
    for (const volunteerId of volunteerIds) {
      try {
        // Fetch volunteer to get Discord ID
        const volunteer = await pb.collection('volunteers').getOne(volunteerId);
        
        if (!volunteer.discord_id) {
          console.warn(`⚠️ Volunteer ${volunteerId} has no Discord ID, skipping DM`);
          results.push({
            volunteerId,
            success: false,
            error: 'No Discord ID',
          });
          continue;
        }

        // Create completion message for this volunteer
        const embed = {
          title: `🎉 Congratulations! Task #${taskData.task_number} Completed!`,
          description: `**${taskData.title}**`,
          url: taskUrl,
          color: 0x57F287, // Discord green
          fields: [
            {
              name: '📝 Task Description',
              value: taskData.description.slice(0, 500) + (taskData.description.length > 500 ? '...' : ''),
              inline: false,
            },
            {
              name: '🏷️ Zone',
              value: taskData.zone,
              inline: true,
            },
            {
              name: '⏱️ Time You Spent',
              value: `${actualMinutes} minutes`,
              inline: true,
            },
            {
              name: '✨ What\'s Next?',
              value: 'Your contribution has been recorded! Check your profile to see your updated stats and level progress.',
              inline: false,
            },
          ],
          timestamp: new Date().toISOString(),
          footer: {
            text: siteConfig.name + ' Task Dashboard',
          },
        };

        const payload = {
          content: `👏 **Great work, ${volunteer.username || volunteer.email?.split('@')[0]}!**\n\nYou've completed a task! Here are the details:`,
          embeds: [embed],
        };

        // Send DM
        await sendDirectMessage(volunteer.discord_id, payload);
        
        console.log(`✅ Completion DM sent to volunteer ${volunteerId} (Discord: ${volunteer.discord_id})`);
        results.push({
          volunteerId,
          success: true,
        });
      } catch (err: any) {
        console.error(`❌ Failed to send DM to volunteer ${volunteerId}:`, err.message);
        results.push({
          volunteerId,
          success: false,
          error: err.message,
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    
    return NextResponse.json({
      success: true,
      results,
      summary: {
        total: volunteerIds.length,
        sent: successCount,
        failed: volunteerIds.length - successCount,
      },
    });
  } catch (error: any) {
    console.error('Failed to send Discord completion DMs:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to send Discord DMs',
        details: error.message,
      },
      { status: 500 }
    );
  }
}


