import { siteConfig } from '@/lib/site-config';
/**
 * Discord Integration Library
 * Utilities for sending messages to Discord channels
 */

interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  fields?: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
  timestamp?: string;
  footer?: {
    text: string;
    icon_url?: string;
  };
  thumbnail?: {
    url: string;
  };
  author?: {
    name: string;
    icon_url?: string;
  };
}

interface DiscordMessagePayload {
  content?: string;
  embeds?: DiscordEmbed[];
  username?: string;
  avatar_url?: string;
}

/**
 * Send a message to a Discord channel using bot token
 */
export async function sendDiscordMessage(
  channelId: string,
  payload: DiscordMessagePayload
): Promise<any> {
  const botToken = process.env.DISCORD_BOT_TOKEN;

  if (!botToken) {
    throw new Error('DISCORD_BOT_TOKEN not configured');
  }

  const endpoint = `https://discord.com/api/v10/channels/${channelId}/messages`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bot ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to send Discord message: ${error}`);
  }

  return response.json();
}

/**
 * Send a direct message to a Discord user
 */
export async function sendDirectMessage(
  userId: string,
  payload: DiscordMessagePayload
): Promise<any> {
  const botToken = process.env.DISCORD_BOT_TOKEN;

  if (!botToken) {
    throw new Error('DISCORD_BOT_TOKEN not configured');
  }

  // Step 1: Create DM channel with user
  const dmChannelResponse = await fetch('https://discord.com/api/v10/users/@me/channels', {
    method: 'POST',
    headers: {
      'Authorization': `Bot ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ recipient_id: userId }),
  });

  if (!dmChannelResponse.ok) {
    const error = await dmChannelResponse.text();
    throw new Error(`Failed to create DM channel: ${error}`);
  }

  const dmChannel = await dmChannelResponse.json();

  // Step 2: Send message to DM channel
  return sendDiscordMessage(dmChannel.id, payload);
}

/**
 * Format a new task announcement for Discord
 */
export function formatTaskAnnouncement(task: {
  task_number: number;
  title: string;
  description: string;
  zone: string;
  estimated_minutes: number;
  created_by_name?: string;
  task_url: string;
  image_url?: string;
}): DiscordMessagePayload {
  const estimatedHours = Math.round(task.estimated_minutes / 60 * 10) / 10;

  const embed: DiscordEmbed = {
    title: `📝 New Task #${task.task_number}: ${task.title}`,
    description: task.description,
    url: task.task_url,
    color: 0xFF7C4B, // TechToss Orange
    fields: [
      {
        name: '🏷️ Zone',
        value: task.zone,
        inline: true,
      },
      {
        name: '⏱️ Estimated Time',
        value: `${task.estimated_minutes} minutes (${estimatedHours}h)`,
        inline: true,
      },
    ],
    timestamp: new Date().toISOString(),
    footer: {
      text: siteConfig.name + ' Task Dashboard',
    },
  };

  if (task.created_by_name) {
    embed.author = {
      name: `Created by ${task.created_by_name}`,
    };
  }

  if (task.image_url) {
    embed.thumbnail = {
      url: task.image_url,
    };
  }

  return {
    content: '✨ **New task available!**',
    embeds: [embed],
  };
}

/**
 * Send a task reminder to a user
 */
export function formatTaskReminder(task: {
  task_number: number;
  title: string;
  description: string;
  due_date?: string;
  task_url: string;
}): DiscordMessagePayload {
  const embed: DiscordEmbed = {
    title: `⏰ Task Reminder: #${task.task_number}`,
    description: task.title,
    url: task.task_url,
    color: 0xFF6B6B, // Red for urgency
    fields: [
      {
        name: 'Description',
        value: task.description.slice(0, 200) + (task.description.length > 200 ? '...' : ''),
        inline: false,
      },
    ],
    timestamp: new Date().toISOString(),
    footer: {
      text: siteConfig.name + ' Task Dashboard',
    },
  };

  if (task.due_date) {
    embed.fields?.push({
      name: '📅 Due Date',
      value: new Date(task.due_date).toLocaleDateString(),
      inline: true,
    });
  }

  return {
    embeds: [embed],
  };
}

/**
 * Format a task completion announcement for Discord
 */
export function formatTaskCompletion(task: {
  task_number: number;
  title: string;
  description: string;
  zone: string;
  completed_by_names: string[];
  actual_minutes: number;
  total_minutes?: number; // Total aggregate time if multiple volunteers
  task_url: string;
}): DiscordMessagePayload {
  const completedHours = Math.round(task.actual_minutes / 60 * 10) / 10;
  const volunteersList = task.completed_by_names.join(', ');

  const fields: DiscordEmbed['fields'] = [
    {
      name: '👥 Completed by',
      value: volunteersList,
      inline: false,
    },
    {
      name: '🏷️ Zone',
      value: task.zone,
      inline: true,
    },
  ];

  // If multiple volunteers, show both per-person and total time
  if (task.total_minutes && task.total_minutes > task.actual_minutes) {
    const totalHours = Math.round(task.total_minutes / 60 * 10) / 10;
    fields.push({
      name: '⏱️ Time per Volunteer',
      value: `${task.actual_minutes} minutes (${completedHours}h)`,
      inline: true,
    });
    fields.push({
      name: '📊 Total Time',
      value: `${task.total_minutes} minutes (${totalHours}h)`,
      inline: true,
    });
  } else {
    fields.push({
      name: '⏱️ Time Spent',
      value: `${task.actual_minutes} minutes (${completedHours}h)`,
      inline: true,
    });
  }

  const embed: DiscordEmbed = {
    title: `✅ Task #${task.task_number} Completed!`,
    description: task.title,
    url: task.task_url,
    color: 0x57F287, // Discord green
    fields,
    timestamp: new Date().toISOString(),
    footer: {
      text: siteConfig.name + ' Task Dashboard',
    },
  };

  return {
    content: '🎉 **Task completed!**',
    embeds: [embed],
  };
}

/**
 * Format a task assignment DM for Discord
 */
export function formatTaskAssignment(task: {
  task_number: number;
  title: string;
  description: string;
  zone: string;
  estimated_minutes: number;
  task_url: string;
}): DiscordMessagePayload {
  const estimatedHours = Math.round(task.estimated_minutes / 60 * 10) / 10;

  const embed: DiscordEmbed = {
    title: `🎯 You've been assigned Task #${task.task_number}`,
    description: task.title,
    url: task.task_url,
    color: 0xFF7C4B, // TechToss Orange
    fields: [
      {
        name: '📝 Description',
        value: task.description.slice(0, 500) + (task.description.length > 500 ? '...' : ''),
        inline: false,
      },
      {
        name: '🏷️ Zone',
        value: task.zone,
        inline: true,
      },
      {
        name: '⏱️ Estimated Time',
        value: `${task.estimated_minutes} minutes (${estimatedHours}h)`,
        inline: true,
      },
    ],
    timestamp: new Date().toISOString(),
    footer: {
      text: siteConfig.name + ' Task Dashboard',
    },
  };

  return {
    content: '👋 **New task assignment!**\n\nYou have been assigned a new task. Click the link below to view details and start tracking your time.',
    embeds: [embed],
  };
}

