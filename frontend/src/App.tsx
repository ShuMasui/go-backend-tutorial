import React, { useState, useEffect, useRef } from 'react';
import { marked } from 'marked';
import { 
  User, 
  Mail, 
  Lock, 
  LogOut, 
  Send, 
  Bot, 
  Sparkles, 
  MessageSquare, 
  Edit2, 
  Loader2,
  Database,
  Eye,
  EyeOff
} from 'lucide-react';

// API configuration
const API_BASE = 'http://localhost:8080';

interface UserProfile {
  id: string;
  username: string;
  email: string;
  bio: string;
  avatar_url: string;
}

interface Message {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: Date;
}

function App() {
  // App Modes: 'mock' | 'api'
  const [appMode, setAppMode] = useState<'mock' | 'api'>('mock');
  
  // Navigation: 'login' | 'signup' | 'chat'
  const [view, setView] = useState<'login' | 'signup' | 'chat'>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Authenticated states
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  
  // Profile edit states
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editUsername, setEditUsername] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editAvatarUrl, setEditAvatarUrl] = useState('');

  // Chat states
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  // Load session from localStorage on start
  useEffect(() => {
    const savedMode = localStorage.getItem('app_mode') as 'mock' | 'api' | null;
    if (savedMode) setAppMode(savedMode);

    const savedToken = localStorage.getItem('auth_token');
    const savedProfile = localStorage.getItem('user_profile');

    if (savedToken && savedProfile) {
      setToken(savedToken);
      setProfile(JSON.parse(savedProfile));
      setView('chat');
    }
  }, []);

  // Save config mode
  const handleModeChange = (mode: 'mock' | 'api') => {
    setAppMode(mode);
    localStorage.setItem('app_mode', mode);
    handleLogout(); // Mode change resets session to avoid conflicts
  };

  // Mock responses database for the offline mode
  const getMockAIResponse = (prompt: string): string => {
    const p = prompt.toLowerCase();
    if (p.includes('hello') || p.includes('hi') || p.includes('こんにちは')) {
      return `Hello ${profile?.username || 'there'}! I am Gemini API (Running in Mock mode). How can I assist you with your project today?`;
    }
    if (p.includes('profile') || p.includes('プロフィール')) {
      return `Your current profile has the username "${profile?.username}" and email "${profile?.email}". You can edit these details in the left sidebar!`;
    }
    if (p.includes('database') || p.includes('postgresql') || p.includes('postgres')) {
      return `PostgreSQL is an amazing database. For this application, you will store:
1. Users table (id, email, password_hash, created_at)
2. Profiles table (user_id, username, bio, avatar_url, updated_at)
      
Would you like assistance in drafting the schema?`;
    }
    return `This is a simulated response to your prompt: "${prompt}".

In Live API Mode, this message will stream directly from the Google Gemini API via your Go backend Server-Sent Events (SSE) connection.

To connect the frontend to your real backend:
1. Run your Go backend on ${API_BASE}
2. Implement the API routes list shown in our API specification
3. Switch the toggle in the top right to "Live API Mode"`;
  };

  // Simulated Streaming for Mock Mode
  const startMockStreaming = (userPrompt: string) => {
    setIsStreaming(true);
    const fullResponse = getMockAIResponse(userPrompt);
    
    // Add empty message for AI
    const aiMessageId = Math.random().toString();
    setMessages(prev => [...prev, {
      id: aiMessageId,
      sender: 'ai',
      text: '',
      timestamp: new Date()
    }]);

    let currentIndex = 0;
    const interval = setInterval(() => {
      if (currentIndex < fullResponse.length) {
        // Yield chunks of text
        const chunkLength = Math.floor(Math.random() * 3) + 1; // 1-3 characters at a time
        const nextIndex = Math.min(currentIndex + chunkLength, fullResponse.length);
        const nextText = fullResponse.slice(0, nextIndex);
        
        setMessages(prev => prev.map(msg => 
          msg.id === aiMessageId ? { ...msg, text: nextText } : msg
        ));
        
        currentIndex = nextIndex;
      } else {
        clearInterval(interval);
        setIsStreaming(false);
      }
    }, 30);
  };

  // Real API SSE Streaming via Fetch and ReadableStream
  const startLiveStreaming = async (userPrompt: string) => {
    setIsStreaming(true);
    const aiMessageId = Math.random().toString();
    
    // Add empty AI message
    setMessages(prev => [...prev, {
      id: aiMessageId,
      sender: 'ai',
      text: '',
      timestamp: new Date()
    }]);

    try {
      const response = await fetch(`${API_BASE}/api/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ prompt: userPrompt })
      });

      if (!response.ok) {
        throw new Error(`Server returned error: ${response.status} ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('ReadableStream not supported by response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        
        // SSE formatting parser (parse multiple events if they arrive combined)
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataContent = line.slice(6);
            if (dataContent === '[DONE]') {
              break;
            }
            try {
              // In case backend sends JSON objects
              const parsed = JSON.parse(dataContent);
              accumulatedText += parsed.text || '';
            } catch {
              // In case backend sends raw strings
              accumulatedText += dataContent;
            }

            setMessages(prev => prev.map(msg => 
              msg.id === aiMessageId ? { ...msg, text: accumulatedText } : msg
            ));
          }
        }
      }
    } catch (err: any) {
      console.error('SSE connection error:', err);
      setMessages(prev => prev.map(msg => 
        msg.id === aiMessageId ? { ...msg, text: `⚠️ Error connecting to server: ${err.message}. Please check if the Go backend is running.` } : msg
      ));
    } finally {
      setIsStreaming(false);
    }
  };

  // Sign up action
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !username) {
      setError('Please fill in all fields');
      return;
    }

    setError(null);
    setLoading(true);

    if (appMode === 'mock') {
      // Simulate network request
      setTimeout(() => {
        const mockProfile: UserProfile = {
          id: Math.random().toString(),
          username,
          email,
          bio: 'Hey there! I am using the Go + Gemini AI Chat application.',
          avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=256&auto=format&fit=crop'
        };

        // Save mock database
        const users = JSON.parse(localStorage.getItem('mock_users') || '[]');
        if (users.find((u: any) => u.email === email)) {
          setError('Email already exists in Mock Database');
          setLoading(false);
          return;
        }

        users.push({ ...mockProfile, password });
        localStorage.setItem('mock_users', JSON.stringify(users));

        setSuccessMsg('Account created successfully! Switching to Login.');
        setView('login');
        setPassword('');
        setLoading(false);
      }, 1000);
    } else {
      // Live API Call
      try {
        const response = await fetch(`${API_BASE}/api/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, email, password })
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || 'Registration failed');
        }

        setSuccessMsg('Account created successfully! Please log in.');
        setView('login');
        setPassword('');
      } catch (err: any) {
        setError(err.message || 'Server connection failed');
      } finally {
        setLoading(false);
      }
    }
  };

  // Log in action
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    setError(null);
    setLoading(true);

    if (appMode === 'mock') {
      setTimeout(() => {
        const users = JSON.parse(localStorage.getItem('mock_users') || '[]');
        const user = users.find((u: any) => u.email === email && u.password === password);

        if (!user) {
          setError('Invalid email or password (Mock Mode)');
          setLoading(false);
          return;
        }

        const mockToken = 'mock_jwt_token_' + Math.random().toString(36).substr(2);
        const userProfile: UserProfile = {
          id: user.id,
          username: user.username,
          email: user.email,
          bio: user.bio || 'Hey there! I am using the Go + Gemini AI Chat application.',
          avatar_url: user.avatar_url
        };

        // Set session
        setToken(mockToken);
        setProfile(userProfile);
        
        localStorage.setItem('auth_token', mockToken);
        localStorage.setItem('user_profile', JSON.stringify(userProfile));

        // Add welcome message
        setMessages([
          {
            id: 'welcome',
            sender: 'ai',
            text: `Welcome back, ${user.username}! Ask me anything. (Mock Mode Active)`,
            timestamp: new Date()
          }
        ]);

        setView('chat');
        setLoading(false);
      }, 1000);
    } else {
      // Live API Call
      try {
        const response = await fetch(`${API_BASE}/api/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || 'Login failed');
        }

        // Response should contain: { token: string, user: UserProfile }
        setToken(data.token);
        setProfile(data.user);

        localStorage.setItem('auth_token', data.token);
        localStorage.setItem('user_profile', JSON.stringify(data.user));

        setMessages([
          {
            id: 'welcome',
            sender: 'ai',
            text: `Welcome back, ${data.user.username}! Connection to Go server established successfully.`,
            timestamp: new Date()
          }
        ]);

        setView('chat');
      } catch (err: any) {
        setError(err.message || 'Server connection failed');
      } finally {
        setLoading(false);
      }
    }
  };

  // Log out action
  const handleLogout = () => {
    setToken(null);
    setProfile(null);
    setMessages([]);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_profile');
    setView('login');
  };

  // Toggle profile editing
  const enterProfileEdit = () => {
    if (!profile) return;
    setEditUsername(profile.username);
    setEditBio(profile.bio);
    setEditAvatarUrl(profile.avatar_url);
    setIsEditingProfile(true);
    setError(null);
  };

  // Save profile changes
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !token) return;

    if (!editUsername) {
      setError('Username cannot be empty');
      return;
    }

    setLoading(true);
    setError(null);

    if (appMode === 'mock') {
      setTimeout(() => {
        const updatedProfile = {
          ...profile,
          username: editUsername,
          bio: editBio,
          avatar_url: editAvatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=256&auto=format&fit=crop'
        };

        // Update in mock database
        const users = JSON.parse(localStorage.getItem('mock_users') || '[]');
        const updatedUsers = users.map((u: any) => 
          u.id === profile.id ? { ...u, username: editUsername, bio: editBio, avatar_url: updatedProfile.avatar_url } : u
        );
        localStorage.setItem('mock_users', JSON.stringify(updatedUsers));
        
        // Update session
        setProfile(updatedProfile);
        localStorage.setItem('user_profile', JSON.stringify(updatedProfile));
        
        setIsEditingProfile(false);
        setLoading(false);
      }, 800);
    } else {
      // Live API Call
      try {
        const response = await fetch(`${API_BASE}/api/profile`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            username: editUsername,
            bio: editBio,
            avatar_url: editAvatarUrl
          })
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || 'Failed to update profile');
        }

        // Response should contain updated UserProfile
        setProfile(data);
        localStorage.setItem('user_profile', JSON.stringify(data));
        setIsEditingProfile(false);
      } catch (err: any) {
        setError(err.message || 'Failed to update profile');
      } finally {
        setLoading(false);
      }
    }
  };

  // Send Chat message
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || isStreaming) return;

    const userPrompt = inputMessage;
    setInputMessage('');

    // Add user message
    setMessages(prev => [...prev, {
      id: Math.random().toString(),
      sender: 'user',
      text: userPrompt,
      timestamp: new Date()
    }]);

    if (appMode === 'mock') {
      startMockStreaming(userPrompt);
    } else {
      startLiveStreaming(userPrompt);
    }
  };

  return (
    <>
      <div className="bg-gradient-mesh"></div>
      
      {/* Configuration Mode Switcher */}
      <div className="config-switcher">
        <button 
          className={`config-btn ${appMode === 'mock' ? 'active' : ''}`}
          onClick={() => handleModeChange('mock')}
          title="Use mock services for frontend testing without a backend server"
        >
          <Database size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }} />
          Mock Mode
        </button>
        <button 
          className={`config-btn ${appMode === 'api' ? 'active' : ''}`}
          onClick={() => handleModeChange('api')}
          title="Connect to the live Go API and Gemini streaming"
        >
          <Bot size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }} />
          Live API
        </button>
      </div>

      <div className="container">
        {/* Main Application Header */}
        <header className="app-header">
          <div className="logo-container">
            <Sparkles size={24} color="#a855f7" />
            <h1 className="logo-text">Gemini Go Portal</h1>
            <span className={`badge ${appMode === 'api' ? 'badge-success' : 'badge-info'}`}>
              {appMode === 'api' ? 'Connected to API' : 'Standalone / Mock'}
            </span>
          </div>
          {token && (
            <button className="btn btn-secondary btn-danger" onClick={handleLogout} style={{ width: 'auto', padding: '0.5rem 1rem' }}>
              <LogOut size={16} />
              Logout
            </button>
          )}
        </header>

        {/* Global Error Banner */}
        {error && (
          <div className="card" style={{ padding: '1rem', marginBottom: '1.5rem', borderColor: 'var(--danger)', background: 'rgba(239, 68, 68, 0.05)' }}>
            <span style={{ color: 'var(--danger)', fontSize: '0.9rem' }}>⚠️ {error}</span>
          </div>
        )}

        {/* Global Success Banner */}
        {successMsg && (
          <div className="card" style={{ padding: '1rem', marginBottom: '1.5rem', borderColor: 'var(--success)', background: 'rgba(16, 185, 129, 0.05)' }}>
            <span style={{ color: 'var(--success)', fontSize: '0.9rem' }}>✓ {successMsg}</span>
          </div>
        )}

        {/* Views Router */}
        {view === 'login' && (
          <div className="auth-container card">
            <div className="auth-header">
              <h2 className="auth-title">Welcome back</h2>
              <p className="auth-subtitle">Sign in to start chatting with Gemini</p>
            </div>
            
            <form onSubmit={handleLogin}>
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <div className="input-wrapper">
                  <Mail size={18} className="input-icon" />
                  <input 
                    type="email" 
                    className="form-input" 
                    placeholder="you@example.com" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Password</label>
                <div className="input-wrapper">
                  <Lock size={18} className="input-icon" />
                  <input 
                    type={showPassword ? 'text' : 'password'} 
                    className="form-input" 
                    placeholder="••••••••" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowPassword(!showPassword)}
                    style={{ position: 'absolute', right: '1rem', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? <Loader2 className="animate-spin" size={18} /> : 'Sign In'}
              </button>
            </form>

            <div className="auth-switch">
              Don't have an account?{' '}
              <span className="auth-link" onClick={() => { setView('signup'); setError(null); setSuccessMsg(null); }}>
                Create account
              </span>
            </div>
          </div>
        )}

        {view === 'signup' && (
          <div className="auth-container card">
            <div className="auth-header">
              <h2 className="auth-title">Create Account</h2>
              <p className="auth-subtitle">Set up a profile to begin</p>
            </div>
            
            <form onSubmit={handleSignUp}>
              <div className="form-group">
                <label className="form-label">Username</label>
                <div className="input-wrapper">
                  <User size={18} className="input-icon" />
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="johndoe" 
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Email Address</label>
                <div className="input-wrapper">
                  <Mail size={18} className="input-icon" />
                  <input 
                    type="email" 
                    className="form-input" 
                    placeholder="you@example.com" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Password</label>
                <div className="input-wrapper">
                  <Lock size={18} className="input-icon" />
                  <input 
                    type={showPassword ? 'text' : 'password'} 
                    className="form-input" 
                    placeholder="••••••••" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowPassword(!showPassword)}
                    style={{ position: 'absolute', right: '1rem', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? <Loader2 className="animate-spin" size={18} /> : 'Create Account'}
              </button>
            </form>

            <div className="auth-switch">
              Already have an account?{' '}
              <span className="auth-link" onClick={() => { setView('login'); setError(null); setSuccessMsg(null); }}>
                Log in
              </span>
            </div>
          </div>
        )}

        {view === 'chat' && profile && (
          <div className="chat-layout">
            {/* Sidebar with Profile view/edit */}
            <div className="chat-sidebar">
              {!isEditingProfile ? (
                <div className="card profile-card">
                  <div className="avatar-wrapper">
                    <img 
                      src={profile.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=256&auto=format&fit=crop'} 
                      alt="Avatar" 
                      className="avatar-image"
                    />
                  </div>
                  <h3 className="profile-username">{profile.username}</h3>
                  <p className="profile-email">{profile.email}</p>
                  
                  <p className="profile-bio">
                    {profile.bio || 'No status written.'}
                  </p>

                  <button 
                    className="btn btn-secondary" 
                    onClick={enterProfileEdit}
                    style={{ marginTop: '1.5rem' }}
                  >
                    <Edit2 size={16} />
                    Edit Profile
                  </button>
                </div>
              ) : (
                <div className="card">
                  <h3 style={{ marginBottom: '1.25rem' }}>Edit Profile</h3>
                  <form onSubmit={handleSaveProfile}>
                    <div className="form-group">
                      <label className="form-label">Username</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        style={{ paddingLeft: '1rem' }}
                        value={editUsername}
                        onChange={(e) => setEditUsername(e.target.value)}
                        required
                      />
                    </div>
                    
                    <div className="form-group">
                      <label className="form-label">Avatar URL (HTTPS)</label>
                      <input 
                        type="url" 
                        className="form-input" 
                        style={{ paddingLeft: '1rem' }}
                        placeholder="https://..."
                        value={editAvatarUrl}
                        onChange={(e) => setEditAvatarUrl(e.target.value)}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Bio (Self Intro)</label>
                      <textarea 
                        className="form-input" 
                        style={{ paddingLeft: '1rem', minHeight: '80px', resize: 'vertical' }}
                        value={editBio}
                        onChange={(e) => setEditBio(e.target.value)}
                      />
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
                      <button 
                        type="button" 
                        className="btn btn-secondary" 
                        onClick={() => setIsEditingProfile(false)}
                        disabled={loading}
                      >
                        Cancel
                      </button>
                      <button 
                        type="submit" 
                        className="btn btn-primary" 
                        disabled={loading}
                      >
                        {loading ? <Loader2 className="animate-spin" size={16} /> : 'Save'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* API specification instructions */}
              <div className="card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <h4 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>💡 Quick Integration Check</h4>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  This React app is designed to call PostgreSQL registration/login APIs and profile management.
                </p>
                <div style={{ borderTop: '1px solid var(--border-color)', margin: '0.5rem 0' }}></div>
                <div style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)' }}>
                  <div>POST /api/signup</div>
                  <div>POST /api/login</div>
                  <div>GET /api/profile</div>
                  <div>PUT /api/profile</div>
                  <div>POST /api/chat/stream</div>
                </div>
              </div>
            </div>

            {/* Chat area */}
            <div className="chat-main">
              <div className="chat-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <MessageSquare size={18} color="var(--accent-primary)" />
                  <h3>Chat Session</h3>
                </div>
                {isStreaming && (
                  <span className="badge badge-info animate-pulse" style={{ background: 'rgba(99, 102, 241, 0.1)', color: 'var(--accent-primary)' }}>
                    Gemini is thinking...
                  </span>
                )}
              </div>

              {/* Message List */}
              <div className="chat-messages">
                {messages.map((msg) => (
                  <div 
                    key={msg.id} 
                    className={`message-bubble ${msg.sender === 'user' ? 'message-user' : 'message-ai'}`}
                  >
                    <div 
                      className="markdown-content"
                      dangerouslySetInnerHTML={{
                        __html: (() => {
                          const contentText = msg.text || (isStreaming && msg.sender === 'ai' ? '...' : '');
                          try {
                            return marked.parse(contentText, { breaks: true, gfm: true }) as string;
                          } catch (err) {
                            return contentText;
                          }
                        })()
                      }}
                    />
                    <span className="message-time">
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              {/* Chat Input */}
              <div className="chat-input-container">
                <form onSubmit={handleSendMessage} className="chat-input-form">
                  <input 
                    type="text" 
                    className="chat-input" 
                    placeholder="Type your message to Gemini..." 
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    disabled={isStreaming}
                  />
                  <button 
                    type="submit" 
                    className="btn btn-primary chat-send-btn" 
                    disabled={!inputMessage.trim() || isStreaming}
                  >
                    {isStreaming ? (
                      <Loader2 className="animate-spin" size={18} />
                    ) : (
                      <>
                        <Send size={18} />
                        <span>Send</span>
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default App;
