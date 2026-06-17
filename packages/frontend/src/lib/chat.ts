import { API_URL, apiClient } from './api';
import type { AITutor, Conversation, ChatMessage } from '@/types';

interface ApiRes<T> {
  success: boolean;
  data: T;
}

function getAuthHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token && /^[\x20-\x7E]+$/.test(token)) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export async function fetchTeachers(): Promise<AITutor[]> {
  const res = await apiClient<ApiRes<AITutor[]>>('/chat/teachers');
  return res.data;
}

export async function fetchConversations(teacherId?: string): Promise<Conversation[]> {
  const query = teacherId ? `?teacher_id=${teacherId}` : '';
  const res = await apiClient<ApiRes<Conversation[]>>(`/chat/conversations${query}`);
  return res.data;
}

export async function createConversation(teacherId: string, title?: string): Promise<Conversation> {
  const res = await apiClient<ApiRes<Conversation>>('/chat/conversations', {
    method: 'POST',
    body: JSON.stringify({ teacher_id: teacherId, title }),
  });
  return res.data;
}

export async function fetchMessages(conversationId: string): Promise<ChatMessage[]> {
  const res = await apiClient<ApiRes<ChatMessage[]>>(`/chat/conversations/${conversationId}/messages`);
  return res.data;
}

export async function deleteConversation(conversationId: string): Promise<void> {
  await apiClient(`/chat/conversations/${conversationId}`, { method: 'DELETE' });
}

export async function sendMessageStream(
  conversationId: string,
  content: string,
  onDelta: (text: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
): Promise<void> {
  const res = await fetch(`${API_URL}/chat/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ content }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    onError(err.error || err.message || `HTTP ${res.status}`);
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    onError('No response body');
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      if (data === '[DONE]') {
        onDone();
        return;
      }
      try {
        const parsed = JSON.parse(data);
        if (parsed.content) onDelta(parsed.content);
        if (parsed.error) onError(parsed.error);
      } catch {}
    }
  }

  onDone();
}
