import { useState, useEffect, useRef } from 'react';
import { getConversations, getMessages, sendMessage, sendTypingIndicator, searchUsers, ChatMessage, Conversation } from '../../api/chat.api';
import { useUserStore } from '../../store/userStore';
import { socket } from '../../services/socket';
import { toast } from 'sonner';
import {
    Send, Paperclip, MoreVertical,
    Phone, Video, ArrowLeft, Search, CheckCheck,
    Image as ImageIcon, Smile, Mic, X, UserPlus, Loader2
} from 'lucide-react';
import { useParams } from 'react-router-dom';

export default function ChatPage() {
    const { userId: urlUserId } = useParams();
    const { user } = useUserStore();
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [activeChat, setActiveChat] = useState<Conversation | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputText, setInputText] = useState('');
    const [loading, setLoading] = useState(true);
    const [typingUser, setTypingUser] = useState<string | null>(null);
    const [isSending, setIsSending] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [filePreview, setFilePreview] = useState<string | null>(null);

    // New Chat Discovery States
    const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const typingTimeoutRef = useRef<any>(null);
    const activeChatRef = useRef<Conversation | null>(null);

    useEffect(() => {
        activeChatRef.current = activeChat;
    }, [activeChat]);

    // Initial Load: Conversations
    useEffect(() => {
        loadConversations();

        // If URL has userId, try to find or start chat
        if (urlUserId) {
            handleStartChat(urlUserId);
        }

        const onReceive = (msg: ChatMessage) => {
            handleIncomingMessage(msg);
        };

        const onSent = (msg: ChatMessage) => {
            handleIncomingMessage(msg);
        };

        const onTyping = (data: { senderId: string, isTyping: boolean }) => {
            const currentActive = activeChatRef.current;
            if (currentActive && data.senderId === currentActive.otherUser._id) {
                setTypingUser(data.isTyping ? currentActive.otherUser.fullName || currentActive.otherUser.username : null);
            }
        };

        socket.on('message:receive', onReceive);
        socket.on('message:sent', onSent);
        socket.on('chat:typing', onTyping);

        return () => {
            socket.off('message:receive', onReceive);
            socket.off('message:sent', onSent);
            socket.off('chat:typing', onTyping);
        };
    }, []); // Run once on mount

    // User Search Logic
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (searchQuery.length >= 2) {
                setIsSearching(true);
                try {
                    const results = await searchUsers(searchQuery);
                    setSearchResults(results);
                } catch (e) {
                    console.error(e);
                } finally {
                    setIsSearching(false);
                }
            } else {
                setSearchResults([]);
            }
        }, 300)
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, typingUser]);

    // Load Messages when active chat changes
    useEffect(() => {
        if (activeChat) {
            loadMessages(activeChat.otherUser._id);
        }
    }, [activeChat]);

    async function loadConversations() {
        try {
            const data = await getConversations();
            setConversations(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }

    async function handleStartChat(targetUserId: string) {
        // Check if conversation already exists
        const existing = conversations.find(c => c.otherUser._id === targetUserId);
        if (existing) {
            setActiveChat(existing);
            setIsNewChatModalOpen(false);
            return;
        }

        // Otherwise, fetch user details and create a "skeleton" active chat
        try {
            // Note: We'd usually have a getOneUser API, but for now we can infer from search results or a quick fetch
            // Let's assume searchResults has the user if started from modal
            const userFromSearch = searchResults.find(u => u._id === targetUserId);
            if (userFromSearch) {
                const skeleton: Conversation = {
                    _id: 'new', // special ID for new chat
                    lastMessage: {} as any,
                    otherUser: userFromSearch,
                    unreadCount: 0
                };
                setActiveChat(skeleton);
                setMessages([]); // Clear for new chat
                setIsNewChatModalOpen(false);
            }
        } catch (e) {
            console.error(e);
        }
    }

    async function loadMessages(otherId: string) {
        try {
            const msgs = await getMessages(otherId);
            setMessages(msgs);
        } catch (e) {
            console.error(e);
        }
    }

    function handleIncomingMessage(msg: ChatMessage) {
        const currentActive = activeChatRef.current;
        // Check if message belongs to active chat
        if (currentActive && (msg.sender === currentActive.otherUser._id || msg.recipient === currentActive.otherUser._id)) {
            setMessages(prev => {
                // Avoid duplicates (especially for 'message:sent' vs optimistc update)
                if (prev.find(m => m._id === msg._id)) return prev;
                return [...prev, msg];
            });
        }
        loadConversations();
    }

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInputText(e.target.value);

        if (activeChat) {
            sendTypingIndicator(activeChat.otherUser._id, true).catch(() => { });

            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = setTimeout(() => {
                sendTypingIndicator(activeChat.otherUser._id, false).catch(() => { });
            }, 3000);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSelectedFile(file);
            const reader = new FileReader();
            reader.onloadend = () => setFilePreview(reader.result as string);
            reader.readAsDataURL(file);
        }
    };

    async function handleSend() {
        if ((!inputText.trim() && !selectedFile) || !activeChat) return;

        setIsSending(true);

        try {
            const actualMsg = await sendMessage(activeChat.otherUser._id, inputText, selectedFile || undefined);
            // Optimistic update if not already there (though 'message:sent' will also trigger it)
            setMessages(prev => {
                if (prev.find(m => m._id === actualMsg._id)) return prev;
                return [...prev, actualMsg];
            });
            setInputText('');
            setSelectedFile(null);
            setFilePreview(null);
            loadConversations();
        } catch (e) {
            console.error(e);
            toast.error('Failed to send message');
        } finally {
            setIsSending(false);
        }
    }

    if (loading) return (
        <div className="h-screen bg-[#050505] flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-emerald-500 font-black tracking-widest uppercase text-xs">Avas Secure Chat</p>
            </div>
        </div>
    );

    return (
        <div className="h-[calc(100vh-80px)] max-w-[1600px] mx-auto p-0 md:p-6 lg:p-10 animate-fade-in">
            <div className="h-full bg-[#0a0a0a] md:rounded-[3rem] border border-white/5 flex overflow-hidden shadow-2xl relative">

                {/* Sidebar - Conversation List */}
                <div className={`w-full md:w-[420px] border-r border-white/5 flex flex-col transition-all duration-500 ${activeChat ? 'hidden md:flex' : 'flex'}`}>
                    {/* Sidebar Header */}
                    <div className="p-8 bg-black/40 backdrop-blur-xl border-b border-white/5">
                        <div className="flex items-center justify-between mb-8">
                            <h1 className="text-3xl font-black text-white tracking-tighter">Chats</h1>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setIsNewChatModalOpen(true)}
                                    className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white transition-all shadow-lg shadow-emerald-500/10 active:scale-95"
                                    title="Start New Chat"
                                >
                                    <UserPlus className="w-5 h-5" />
                                </button>
                                <button className="p-3 rounded-2xl bg-white/5 text-slate-400 hover:text-white transition-all">
                                    <Smile className="w-5 h-5" />
                                </button>
                                <button className="p-3 rounded-2xl bg-white/5 text-slate-400 hover:text-white transition-all">
                                    <MoreVertical className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                        <div className="relative group">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-emerald-500 transition-colors" />
                            <input
                                type="text"
                                placeholder="Search messages..."
                                className="w-full bg-white/5 border border-white/5 rounded-[1.25rem] py-4 pl-12 pr-4 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/5 transition-all"
                            />
                        </div>
                    </div>

                    {/* Conversations List */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar bg-black/20">
                        {conversations.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-center p-8">
                                <div className="w-20 h-20 bg-emerald-500/5 rounded-full flex items-center justify-center mb-4 border border-emerald-500/10 shadow-inner">
                                    <Mic className="w-8 h-8 text-emerald-900" />
                                </div>
                                <h3 className="text-white font-black text-lg tracking-tight mb-2">No active chats</h3>
                                <p className="text-slate-500 text-sm font-medium mb-8">Start a new conversation with anyone in the system</p>
                                <button
                                    onClick={() => setIsNewChatModalOpen(true)}
                                    className="px-8 py-3 bg-emerald-500 rounded-2xl text-white text-xs font-black uppercase tracking-widest shadow-xl shadow-emerald-500/20 hover:scale-105 active:scale-95 transition-all"
                                >
                                    Start Chat
                                </button>
                            </div>
                        ) : (
                            conversations.map(conv => (
                                <button
                                    key={conv._id}
                                    onClick={() => setActiveChat(conv)}
                                    className={`w-full p-5 rounded-[2rem] flex items-center gap-5 transition-all duration-300 group ${activeChat?._id === conv._id
                                        ? 'bg-emerald-500/10 border border-emerald-500/20'
                                        : 'hover:bg-white/5 border border-transparent'
                                        }`}
                                >
                                    <div className="relative">
                                        <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 p-[2px] transition-transform group-hover:scale-105">
                                            <div className="w-full h-full rounded-full bg-black flex items-center justify-center overflow-hidden">
                                                {conv.otherUser.avatar ? (
                                                    <img src={conv.otherUser.avatar} className="w-full h-full object-cover" />
                                                ) : (
                                                    <span className="font-black text-white text-xl">{conv.otherUser.username[0].toUpperCase()}</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="absolute bottom-0 right-0 w-4 h-4 bg-emerald-500 rounded-full border-[3px] border-[#0a0a0a]"></div>
                                    </div>
                                    <div className="flex-1 text-left min-w-0">
                                        <div className="flex justify-between items-baseline mb-1">
                                            <span className={`font-black tracking-tight truncate ${activeChat?._id === conv._id ? 'text-white' : 'text-slate-300'}`}>
                                                {conv.otherUser.fullName || conv.otherUser.username}
                                            </span>
                                            <span className="text-[10px] text-slate-600 font-black uppercase tracking-widest">
                                                {new Date(conv.lastMessage.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-500 truncate font-medium flex items-center gap-1.5">
                                            {conv.lastMessage.sender === (user?.id || user?._id) && <CheckCheck className="w-3 h-3 text-emerald-500" />}
                                            {conv.lastMessage.content}
                                        </p>
                                    </div>
                                    {conv.unreadCount > 0 && (
                                        <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center text-[10px] font-black text-white shadow-xl shadow-emerald-500/40 animate-bounce">
                                            {conv.unreadCount}
                                        </div>
                                    )}
                                </button>
                            ))
                        )}
                    </div>
                </div>

                {/* Chat Main Window */}
                {activeChat ? (
                    <div className="flex-1 flex flex-col bg-black/40 relative">
                        {/* Chat Header */}
                        <div className="p-6 md:p-8 bg-black/60 backdrop-blur-2xl border-b border-white/5 flex items-center justify-between z-20">
                            <div className="flex items-center gap-5">
                                <button onClick={() => setActiveChat(null)} className="md:hidden p-3 rounded-2xl bg-white/5 text-slate-400">
                                    <ArrowLeft className="w-5 h-5" />
                                </button>
                                <div className="relative">
                                    <div className="w-12 h-12 rounded-full border-2 border-emerald-500/30 p-[2px]">
                                        <div className="w-full h-full rounded-full bg-black flex items-center justify-center overflow-hidden ring-2 ring-emerald-500/10">
                                            {activeChat.otherUser.avatar ? (
                                                <img src={activeChat.otherUser.avatar} className="w-full h-full object-cover" />
                                            ) : (
                                                <span className="font-black text-white text-lg">{activeChat.otherUser.username[0].toUpperCase()}</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-[#0a0a0a]"></div>
                                </div>
                                <div className="space-y-0.5">
                                    <h2 className="font-black text-white text-xl tracking-tight">{activeChat.otherUser.fullName || activeChat.otherUser.username}</h2>
                                    <div className="flex items-center gap-2">
                                        {typingUser ? (
                                            <span className="text-xs text-emerald-400 font-black animate-pulse uppercase tracking-widest">Typing...</span>
                                        ) : (
                                            <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest flex items-center gap-1.5">
                                                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                                                Online
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => toast.info("Video calls coming soon in the next update!")}
                                    className="p-4 rounded-2xl bg-white/5 text-slate-400 hover:text-white hover:bg-emerald-500/10 transition-all shadow-lg active:scale-95"
                                >
                                    <Video className="w-5 h-5" />
                                </button>
                                <button
                                    onClick={() => toast.info("Voice calls coming soon in the next update!")}
                                    className="p-4 rounded-2xl bg-white/5 text-slate-400 hover:text-white hover:bg-emerald-500/10 transition-all shadow-lg active:scale-95"
                                >
                                    <Phone className="w-5 h-5" />
                                </button>
                                <button className="p-4 rounded-2xl bg-white/5 text-slate-400 hover:text-white transition-all">
                                    <MoreVertical className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Messages Area */}
                        <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar bg-[url('https://grainy-gradients.vercel.app/noise.svg')] bg-fixed opacity-90">
                            {messages.map((msg, i) => {
                                const isMe = msg.sender === (user?.id || user?._id);
                                return (
                                    <div key={i} className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-slide-up`}>
                                        <div className={`max-w-[75%] space-y-1 ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                                            <div className={`rounded-[2rem] p-5 shadow-2xl relative group ${isMe
                                                ? 'bg-emerald-500 text-white rounded-tr-none'
                                                : 'bg-[#1a1a1a] text-slate-200 border border-white/5 rounded-tl-none'
                                                }`}>

                                                {/* Image Content */}
                                                {(msg as any).attachments?.map((att: any, idx: number) => (
                                                    <div key={idx} className="mb-3 rounded-2xl overflow-hidden border border-white/10 max-w-sm">
                                                        <img src={att.url} alt="Shared content" className="w-full h-auto object-cover hover:scale-105 transition-transform duration-500 cursor-pointer" />
                                                    </div>
                                                ))}

                                                <p className="text-sm font-medium leading-relaxed">{msg.content}</p>

                                                <div className="flex items-center gap-2 mt-3 justify-end opacity-60 group-hover:opacity-100 transition-opacity">
                                                    <span className="text-[9px] font-black uppercase tracking-tighter">
                                                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                    {isMe && <CheckCheck className={`w-3.5 h-3.5 ${msg.read ? 'text-blue-300' : 'text-white/40'}`} />}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            {typingUser && (
                                <div className="flex justify-start animate-slide-up">
                                    <div className="bg-white/5 rounded-full px-5 py-3 flex gap-1 items-center border border-white/5 backdrop-blur-md">
                                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce"></div>
                                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* File Preview Overlay */}
                        {filePreview && (
                            <div className="absolute bottom-32 left-8 right-8 p-4 bg-emerald-500 rounded-[2rem] shadow-2xl animate-slide-up flex items-center justify-between z-30">
                                <div className="flex items-center gap-4">
                                    <img src={filePreview} className="w-16 h-16 rounded-xl object-cover border-2 border-white/20" />
                                    <div className="text-white">
                                        <p className="font-black text-sm">Image Selected</p>
                                        <p className="text-[10px] opacity-60 uppercase font-bold tracking-widest">{selectedFile?.name}</p>
                                    </div>
                                </div>
                                <button onClick={() => { setSelectedFile(null); setFilePreview(null); }} className="p-3 bg-black/20 rounded-full text-white hover:bg-black/40 transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        )}

                        {/* Input Area */}
                        <div className="p-8 md:p-10 bg-black/80 backdrop-blur-3xl border-t border-white/5">
                            <div className="flex items-center gap-4">
                                <div className="flex gap-2">
                                    <label className="p-4 rounded-2xl bg-white/5 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all cursor-pointer">
                                        <Paperclip className="w-5 h-5" />
                                        <input type="file" className="hidden" onChange={handleFileSelect} accept="image/*" />
                                    </label>
                                    <button className="p-4 rounded-2xl bg-white/5 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all hidden md:block">
                                        <ImageIcon className="w-5 h-5" />
                                    </button>
                                </div>

                                <div className="flex-1 relative">
                                    <textarea
                                        value={inputText}
                                        onChange={handleInputChange}
                                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                                        placeholder="Type a secure message..."
                                        className="w-full bg-white/5 border border-white/5 rounded-[1.5rem] py-5 px-6 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/5 resize-none text-sm font-medium transition-all max-h-32"
                                        rows={1}
                                    />
                                </div>

                                <button
                                    onClick={handleSend}
                                    disabled={(!inputText.trim() && !selectedFile) || isSending}
                                    className="p-5 rounded-[1.5rem] bg-emerald-500 text-white hover:bg-emerald-400 disabled:opacity-50 disabled:grayscale transition-all shadow-xl shadow-emerald-500/20 active:scale-95"
                                >
                                    {isSending ? <RefreshCw className="w-6 h-6 animate-spin" /> : <Send className="w-6 h-6 translate-x-0.5" />}
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="hidden md:flex flex-1 items-center justify-center flex-col text-center p-20 bg-black/40 relative">
                        <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/5 to-transparent"></div>
                        <div className="relative">
                            <div className="w-48 h-48 rounded-[3rem] bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-10 animate-pulse-slow">
                                <div className="w-32 h-32 rounded-[2.5rem] bg-emerald-500/20 flex items-center justify-center">
                                    <Send className="w-16 h-16 text-emerald-500" />
                                </div>
                            </div>
                            <h2 className="text-4xl font-black text-white mb-4 tracking-tighter">Your Messages</h2>
                            <p className="text-slate-500 max-w-sm mx-auto font-medium leading-relaxed">
                                End-to-end encrypted messaging for all users. Select a conversation to begin.
                            </p>
                            <button
                                onClick={() => setIsNewChatModalOpen(true)}
                                className="mt-10 px-10 py-4 bg-emerald-500 rounded-2xl text-white font-black uppercase tracking-widest text-xs shadow-2xl shadow-emerald-500/30 hover:bg-emerald-400 hover:-translate-y-1 transition-all"
                            >
                                Start New Chat
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* New Chat Modal */}
            {isNewChatModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-xl animate-fade-in" onClick={() => setIsNewChatModalOpen(false)}></div>
                    <div className="relative w-full max-w-md bg-[#0a0a0a] rounded-[3rem] border border-white/10 shadow-3xl overflow-hidden animate-slide-up">
                        <div className="p-8 border-b border-white/5 flex items-center justify-between bg-black/40">
                            <div>
                                <h3 className="text-2xl font-black text-white tracking-tighter">New Chat</h3>
                                <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Start a conversation</p>
                            </div>
                            <button onClick={() => setIsNewChatModalOpen(false)} className="p-4 rounded-full bg-white/5 text-slate-400 hover:text-white transition-all">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="p-8 space-y-6">
                            <div className="relative">
                                <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder="Search by name or username..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-5 pl-14 pr-6 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/50 transition-all font-medium"
                                />
                            </div>

                            <div className="max-h-[350px] overflow-y-auto space-y-2 custom-scrollbar bg-black/20 rounded-3xl p-2">
                                {isSearching ? (
                                    <div className="flex flex-col items-center justify-center py-12 gap-3">
                                        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                                        <p className="text-xs font-black text-emerald-500 uppercase tracking-widest">Searching Avas...</p>
                                    </div>
                                ) : searchResults.length > 0 ? (
                                    searchResults.map((u: any) => (
                                        <button
                                            key={u._id}
                                            onClick={() => handleStartChat(u._id)}
                                            className="w-full p-4 hover:bg-emerald-500/10 rounded-2xl flex items-center gap-4 transition-all group border border-transparent hover:border-emerald-500/20"
                                        >
                                            <div className="w-12 h-12 rounded-full bg-emerald-500/20 p-0.5 border border-emerald-500/30">
                                                <div className="w-full h-full rounded-full bg-black flex items-center justify-center overflow-hidden">
                                                    {u.avatar ? (
                                                        <img src={u.avatar} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <span className="font-black text-white text-lg">{u.username[0].toUpperCase()}</span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="text-left">
                                                <div className="font-black text-white group-hover:text-emerald-400 transition-colors uppercase tracking-tight">{u.fullName || u.username}</div>
                                                <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest flex items-center gap-2">
                                                    <span className="px-2 py-0.5 bg-white/5 rounded-md">{u.role}</span>
                                                    @{u.username}
                                                </div>
                                            </div>
                                        </button>
                                    ))
                                ) : searchQuery.length >= 2 ? (
                                    <div className="text-center py-12">
                                        <p className="text-slate-500 font-black uppercase tracking-widest text-[10px]">No users found</p>
                                    </div>
                                ) : (
                                    <div className="text-center py-12">
                                        <p className="text-slate-600 font-black uppercase tracking-widest text-[10px]">Type at least 2 characters</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function RefreshCw(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
            <path d="M3 21v-5h5" />
        </svg>
    );
}

