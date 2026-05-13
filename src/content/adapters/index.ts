import { BaseAdapter } from './BaseAdapter';
import { ChatGPTAdapter } from './ChatGPTAdapter';
import { GmailAdapter } from './GmailAdapter';
import { LinkedInAdapter } from './LinkedInAdapter';
import { WhatsAppAdapter } from './WhatsAppAdapter';
import { XAdapter } from './XAdapter';

export function pickAdapter(): BaseAdapter | null {
  const host = window.location.hostname.toLowerCase();
  if (host === 'chat.openai.com' || host === 'chatgpt.com' || host === 'www.chatgpt.com') {
    return new ChatGPTAdapter();
  }
  if (host === 'web.whatsapp.com') {
    return new WhatsAppAdapter();
  }
  if (host === 'www.linkedin.com' || host === 'linkedin.com') {
    return new LinkedInAdapter();
  }
  if (host === 'x.com' || host === 'twitter.com' || host === 'www.x.com' || host === 'www.twitter.com') {
    return new XAdapter();
  }
  if (host === 'mail.google.com') {
    return new GmailAdapter();
  }
  return null;
}

export { BaseAdapter };
