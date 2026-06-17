'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { MessageSquare, Plus, Trash2, ChevronLeft, ChevronRight, UserCircle } from 'lucide-react';
import { useAgeTheme } from '@/contexts/AgeThemeContext';
import type { AITutor, Conversation } from '@/types';
import MathMarkdown from '@/components/MathMarkdown';
import {
  fetchTeachers,
  fetchConversations,
  createConversation,
  fetchMessages,
  deleteConversation,
  sendMessageStream,
} from '@/lib/chat';

interface LocalMessage {
  role: 'student' | 'tutor';
  content: string;
}

export default function ChatPage() {
  const { theme } = useAgeTheme();

  // Data state
  const [teachers, setTeachers] = useState<AITutor[]>([]);
  const [allConversations, setAllConversations] = useState<Conversation[]>([]);
  const [selectedTeacher, setSelectedTeacher] = useState<AITutor | null>(null);
  const [activeSession, setActiveSession] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<LocalMessage[]>([]);

  // UI state
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [historySidebar, setHistorySidebar] = useState(true);
  const [currentTime] = useState(() => Date.now());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, typing, scrollToBottom]);

  // Load teachers + all conversations on mount
  useEffect(() => {
    Promise.all([fetchTeachers(), fetchConversations()])
      .then(([t, convs]) => {
        setTeachers(t);
        setAllConversations(convs);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // Teacher lookup map
  const teacherMap = useMemo(() => {
    const map = new Map<string, AITutor>();
    for (const t of teachers) map.set(t.id, t);
    return map;
  }, [teachers]);

  const hasHistory = allConversations.length > 0;

  // Load messages when session changes
  useEffect(() => {
    if (!activeSession) {
      queueMicrotask(() => setMessages([]));
      return;
    }
    fetchMessages(activeSession.id)
      .then((msgs) => {
        setMessages(msgs.map((m) => ({
          role: m.role === 'student' ? 'student' as const : 'tutor' as const,
          content: m.content,
        })));
      })
      .catch(() => {});
  }, [activeSession]);

  function selectTeacher(teacher: AITutor) {
    setSelectedTeacher(teacher);
    setActiveSession(null);
    setMessages([]);
  }

  function selectConversation(conv: Conversation) {
    const teacher = teacherMap.get(conv.ai_tutor_id);
    if (teacher) setSelectedTeacher(teacher);
    setActiveSession(conv);
  }

  async function handleNewSession() {
    if (!selectedTeacher) return;
    try {
      const session = await createConversation(selectedTeacher.id);
      setAllConversations((prev) => [session, ...prev]);
      setActiveSession(session);
      setMessages([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi tạo phiên chat');
    }
  }

  async function handleDeleteSession(sessionId: string) {
    try {
      await deleteConversation(sessionId);
      setAllConversations((prev) => prev.filter((s) => s.id !== sessionId));
      if (activeSession?.id === sessionId) {
        setActiveSession(null);
        setMessages([]);
      }
    } catch {}
  }

  async function sendMessage(text?: string) {
    const content = text || input.trim();
    if (!content || !activeSession || typing) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'student', content }]);
    setTyping(true);
    setMessages((prev) => [...prev, { role: 'tutor', content: '' }]);

    await sendMessageStream(
      activeSession.id,
      content,
      (delta) => {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          updated[updated.length - 1] = { ...last, content: last.content + delta };
          return updated;
        });
      },
      () => setTyping(false),
      (err) => {
        setTyping(false);
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'tutor', content: `Lỗi: ${err}` };
          return updated;
        });
      },
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage();
  };

  function formatTime(dateStr: string) {
    const diff = currentTime - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Vừa xong';
    if (mins < 60) return `${mins} phút trước`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} giờ trước`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} ngày trước`;
    return new Date(dateStr).toLocaleDateString('vi-VN');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-7rem)]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  // --- Conversation History Sidebar ---
  function renderHistorySidebar() {
    if (!hasHistory && !selectedTeacher) return null;
    return (
      <div className={`${historySidebar ? 'w-72 hidden lg:block' : 'w-0'} shrink-0 transition-all duration-200 overflow-hidden`}>
        {historySidebar && (
          <div className="w-72 h-full flex flex-col rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-gray-500" />
                  <h3 className="text-sm font-semibold text-gray-900">Lịch sử trò chuyện</h3>
                </div>
                <span className="text-xs text-gray-400">{allConversations.length}</span>
              </div>
              {/* Action buttons */}
              <div className="space-y-2">
                {selectedTeacher && (
                  <button
                    onClick={handleNewSession}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
                  >
                    <Plus className="w-4 h-4" />
                    Cuộc trò chuyện mới
                  </button>
                )}
                <button
                  onClick={() => { setSelectedTeacher(null); setActiveSession(null); setMessages([]); }}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                >
                  <UserCircle className="w-4 h-4" />
                  Trò chuyện với GV khác
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {allConversations.map((conv) => {
                const teacher = teacherMap.get(conv.ai_tutor_id);
                const isActive = activeSession?.id === conv.id;
                return (
                  <div
                    key={conv.id}
                    className={`group relative px-3 py-3 cursor-pointer transition border-b border-gray-50 ${
                      isActive ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                    onClick={() => selectConversation(conv)}
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="text-lg shrink-0 mt-0.5">{teacher?.avatar_emoji || '🤖'}</span>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm truncate ${isActive ? 'font-medium text-blue-700' : 'text-gray-900'}`}>
                          {conv.title || teacher?.display_name || 'Cuộc trò chuyện'}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">{teacher?.display_name || ''}</p>
                        <p className="text-xs text-gray-300 mt-0.5">{formatTime(conv.updated_at)}</p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteSession(conv.id); }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-400 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderHistoryToggle() {
    if (!hasHistory) return null;
    return (
      <button
        onClick={() => setHistorySidebar(!historySidebar)}
        className="hidden lg:block absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white border border-gray-200 rounded-r-lg p-1.5 shadow-sm hover:bg-gray-50 transition"
        style={{ marginLeft: historySidebar ? '18rem' : '0' }}
        aria-label={historySidebar ? 'Ẩn lịch sử chat' : 'Hiện lịch sử chat'}
      >
        {historySidebar ? <ChevronLeft className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
      </button>
    );
  }

  // --- Teacher selection screen ---
  if (!selectedTeacher) {
    return (
      <div className="flex h-[calc(100vh-7rem)] gap-3 relative">
        {renderHistorySidebar()}
        {renderHistoryToggle()}
        <div className="flex-1 overflow-y-auto">
          <div className="space-y-6 p-1">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Chọn giáo viên</h1>
              <p className="text-sm text-gray-500 mt-1">Mỗi giáo viên có phong cách giảng dạy riêng biệt</p>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {teachers.map((t) => (
                <button
                  key={t.id}
                  onClick={() => selectTeacher(t)}
                  className="text-left rounded-2xl bg-white p-5 border-l-4 border-blue-500 shadow-sm ring-1 ring-gray-100 transition hover:bg-blue-50"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-3xl">{t.avatar_emoji}</span>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">{t.display_name}</h3>
                      <span className="text-sm text-blue-600 font-medium">{t.tone_style}</span>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{t.description}</p>
                  <div className="flex gap-2 flex-wrap">
                    {t.teaching_style && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">{t.teaching_style}</span>
                    )}
                    {t.personality && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{t.personality}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }


  // --- Chat interface ---
  return (
    <div className="flex h-[calc(100vh-7rem)] gap-3 relative">
      {renderHistorySidebar()}
      {renderHistoryToggle()}
      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-2xl">{selectedTeacher.avatar_emoji}</span>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {activeSession ? (activeSession.title || selectedTeacher.display_name) : selectedTeacher.display_name}
            </h1>
            <p className="text-sm text-gray-500">{selectedTeacher.tone_style}</p>
          </div>
        </div>

        {!activeSession ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4">
              <span className="text-5xl block">{selectedTeacher.avatar_emoji}</span>
              <h2 className="text-xl font-bold text-gray-900">{selectedTeacher.display_name}</h2>
              <p className="text-sm text-gray-500 max-w-md">{selectedTeacher.description}</p>
              <button
                onClick={handleNewSession}
                className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                Bắt đầu trò chuyện
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className={`flex-1 overflow-y-auto ${theme.cardRadius} bg-white ring-1 ring-gray-100 p-4 space-y-3 shadow-sm`}>
              {messages.length === 0 && (
                <div className="text-center text-gray-400 text-sm mt-8">
                  Hãy gửi tin nhắn để bắt đầu cuộc trò chuyện
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'student' ? 'justify-end' : 'justify-start'} mb-2`}>
                  <div className="flex items-end gap-2 max-w-[85%]">
                    {msg.role === 'tutor' && (
                      <span className="shrink-0 text-xl">{selectedTeacher.avatar_emoji}</span>
                    )}
                    <div
                      className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                        msg.role === 'student'
                          ? 'bg-blue-600 text-white rounded-br-md shadow-md'
                          : 'bg-gray-100 text-gray-800 rounded-bl-md'
                      }`}
                    >
                      {msg.role === 'tutor' ? (
                        <MathMarkdown content={msg.content} className="leading-relaxed" />
                      ) : (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {typing && messages[messages.length - 1]?.content === '' && (
                <div className="flex justify-start">
                  <div className="flex items-end gap-2">
                    <span className="text-xl">{selectedTeacher.avatar_emoji}</span>
                    <div className="rounded-2xl px-4 py-3 bg-gray-100">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={`Hỏi ${selectedTeacher.display_name}...`}
                className="flex-1 rounded-xl px-4 py-3 text-sm border border-gray-200 bg-white outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
              />
              <button
                type="submit"
                disabled={!input.trim() || typing}
                className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Gửi
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
