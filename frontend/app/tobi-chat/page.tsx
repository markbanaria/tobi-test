'use client'

// Removed useChat import - using direct API calls instead
import { useState, useRef, useEffect } from 'react'
import { clsx } from 'clsx'
import { createClient } from '@supabase/supabase-js'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import rehypeRaw from 'rehype-raw'

// Supabase client setup (optional)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null

interface Source {
  title?: string
  url?: string
  content?: string
  relevance_score?: number
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: Source[]
  is_interrupted?: boolean
  hitl_phase?: string
  hitl_prompt?: string
  hitl_context?: any
  error?: boolean
  error_type?: string
  metadata?: {
    type: string
    phase?: string
    error_type?: string
  }
}

interface HitlState {
  isActive: boolean
  phase?: string
  prompt?: string
  context?: any
  conversationId?: string
}

// Types from watchtower
interface Employee {
  id: string
  name: string
  position: string
  email?: string
  branch_id: string
  is_active: boolean
}

interface Customer {
  id: string
  name: string
  phone?: string
  mobile_number?: string
  email?: string
  company?: string
  is_for_business: boolean
  address?: string
  notes?: string
  created_at: string
}

interface User {
  id: string
  display_name: string
  email: string
  user_type: 'employee' | 'customer'
  is_active: boolean
  created_at: string
}

interface StoredMessage {
  id: string
  conversation_id: string
  role: string
  content: string
  created_at: string
  metadata?: any
}

interface StoredConversation {
  id: string
  user_id: string
  title?: string
  created_at: string
  updated_at: string
}

interface MediaAttachment {
  type: 'image' | 'video' | 'audio' | 'document'
  url: string
  name: string
  size?: number
  mimeType?: string
}

export default function TobiChatPage() {
  const [conversationId, setConversationId] = useState<string>(() => 
    `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  )
  
  const [hitlState, setHitlState] = useState<HitlState>({ isActive: false })
  const [lastSources, setLastSources] = useState<Source[]>([])
  
  // User selection and conversation history
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [conversations, setConversations] = useState<StoredConversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<StoredConversation | null>(null)
  const [storedMessages, setStoredMessages] = useState<StoredMessage[]>([])
  const [showUserSelector, setShowUserSelector] = useState(false)
  const [showConversationHistory, setShowConversationHistory] = useState(false)
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [loadingConversations, setLoadingConversations] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Chat state management - following dual agent debug pattern
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Direct API call function - following dual agent debug pattern
  const sendMessage = async (message: string) => {
    if (!selectedUser || !message.trim()) return

    // Add user message immediately
    const userMessage: ChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: message.trim(),
    }

    setMessages(prev => [...prev, userMessage])
    setIsLoading(true)
    setError(null)

    try {
      const requestBody = {
        message: message.trim(),
        conversation_id: conversationId,
        user_id: selectedUser.id,
        include_sources: true
      }

      console.log('🔍 [CHAT] Sending message:', requestBody)

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/chat/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const result = await response.json()
      console.log('🔍 [CHAT] Response:', result)

      // Update conversation ID if changed
      if (result.conversation_id && result.conversation_id !== conversationId) {
        setConversationId(result.conversation_id)
      }

      // Handle HITL interrupt
      if (result.is_interrupted) {
        console.log('🔍 [CHAT] HITL interrupt detected')
        setHitlState({
          isActive: true,
          phase: result.hitl_phase,
          prompt: result.hitl_prompt,
          context: result.hitl_context,
          conversationId: result.conversation_id
        })
      } else {
        // Reset HITL state for normal responses
        setHitlState({ isActive: false })
      }

      // Add AI response
      const aiMessage: ChatMessage = {
        id: `ai_${Date.now()}`,
        role: 'assistant',
        content: result.message,
        sources: result.sources || [],
        is_interrupted: result.is_interrupted,
        hitl_phase: result.hitl_phase,
        hitl_prompt: result.hitl_prompt,
        hitl_context: result.hitl_context,
        error: result.error,
        error_type: result.error_type
      }

      setMessages(prev => [...prev, aiMessage])

    } catch (err) {
      console.error('🔍 [CHAT] Error:', err)
      setError(err instanceof Error ? err.message : 'Unknown error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (input.trim() && !isLoading) {
      sendMessage(input)
      setInput('')
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
  }

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Load users on component mount
  useEffect(() => {
    fetchUsers()
  }, [])

  // Load conversations when user changes
  useEffect(() => {
    if (selectedUser) {
      fetchConversations()
    } else {
      setConversations([])
      setSelectedConversation(null)
      setStoredMessages([])
    }
  }, [selectedUser])

  // Load messages when user changes - matching dual agent debug pattern
  useEffect(() => {
    if (selectedUser) {
      fetchConversationMessages()
    } else {
      setMessages([])
      setStoredMessages([])
    }
  }, [selectedUser])

  const fetchUsers = async () => {
    if (!supabase) {
      console.warn('Supabase not configured - skipping user fetch')
      return
    }

    setLoadingUsers(true)
    try {
      // Fetch users with their associated employee/customer IDs - matching dual agent debug pattern
      const { data, error } = await supabase
        .from('users')
        .select(`
          id,
          display_name,
          email,
          user_type,
          employee_id,
          customer_id,
          is_active
        `)
        .eq('is_active', true)
        .order('display_name')

      if (error) {
        console.error('Error fetching users:', error)
        return
      }

      // Transform to our User type - matching dual agent debug pattern
      const transformedUsers = data?.map(user => ({
        id: user.id,
        display_name: user.display_name || user.email,
        email: user.email,
        user_type: user.user_type as 'employee' | 'customer',
        is_active: user.is_active,
        created_at: user.created_at
      })) || []

      setUsers(transformedUsers)
    } catch (error) {
      console.error('Error fetching users:', error)
    } finally {
      setLoadingUsers(false)
    }
  }

  const fetchConversations = async () => {
    if (!selectedUser || !supabase) return

    setLoadingConversations(true)
    try {
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('user_id', selectedUser.id)
        .order('updated_at', { ascending: false })
        .limit(20)

      if (error) {
        console.error('Error fetching conversations:', error)
        return
      }

      setConversations(data || [])
    } catch (error) {
      console.error('Error fetching conversations:', error)
    } finally {
      setLoadingConversations(false)
    }
  }

  const fetchConversationMessages = async () => {
    if (!selectedUser) return

    setLoadingHistory(true)
    try {
      // Use the memory debug API to load messages - matching dual agent debug pattern
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const url = `${API_BASE_URL}/api/v1/memory-debug/users/${selectedUser.id}/messages`
      const response = await fetch(url)
      
      if (response.ok) {
        const result = await response.json()
        
        if (result.success && result.data) {
          // Convert to chat messages format - matching dual agent debug pattern
          const chatMessages: ChatMessage[] = result.data.map((msg: any) => ({
            id: msg.id,
            role: (msg.role === 'human' ? 'user' : msg.role === 'ai' ? 'assistant' : msg.role) as 'user' | 'assistant',
            content: msg.content,
            sources: msg.metadata?.sources || [],
            is_interrupted: msg.metadata?.is_interrupted,
            hitl_phase: msg.metadata?.hitl_phase,
            error: msg.metadata?.error,
            error_type: msg.metadata?.error_type
          })).sort((a, b) => new Date(result.data.find((m: any) => m.id === a.id)?.created_at || 0).getTime() - 
                              new Date(result.data.find((m: any) => m.id === b.id)?.created_at || 0).getTime())

          // Get conversation ID from messages
          const conversationId = result.data.length > 0 ? result.data[0].conversation_id : null
          if (conversationId) {
            setConversationId(conversationId)
          }

          setMessages(chatMessages)
          setStoredMessages(result.data || [])
        } else {
          setMessages([])
          setStoredMessages([])
        }
      } else {
        console.error('Failed to load messages:', response.statusText)
        setMessages([])
        setStoredMessages([])
      }
    } catch (error) {
      console.error('Error fetching messages:', error)
      setMessages([])
      setStoredMessages([])
    } finally {
      setLoadingHistory(false)
    }
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`
    }
  }, [input])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e as any)
    }
  }

  // HITL approval handlers
  const handleHitlApproval = async (approved: boolean) => {
    if (!hitlState.isActive) return
    
    const approvalMessage = approved ? 'approve' : 'deny'
    console.log(`🔍 [HITL] Sending ${approvalMessage} for phase: ${hitlState.phase}`)
    
    // Reset HITL state
    setHitlState({ isActive: false })
    
    // Send approval/denial as a regular message
    await sendMessage(approvalMessage)
  }

  const clearConversation = () => {
    const newConvId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    setConversationId(newConvId)
    setHitlState({ isActive: false })
    setLastSources([])
    setSelectedConversation(null)
    setStoredMessages([])
    setMessages([]) // Clear messages directly instead of reload
    setError(null)
  }

  // Media detection and rendering
  const isImageUrl = (url: string) => {
    return /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url)
  }

  const isVideoUrl = (url: string) => {
    return /\.(mp4|webm|ogg|mov|avi)$/i.test(url)
  }

  const isAudioUrl = (url: string) => {
    return /\.(mp3|wav|ogg|m4a|aac)$/i.test(url)
  }

  const extractMediaUrls = (text: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g
    const urls = text.match(urlRegex) || []
    return urls.filter(url => isImageUrl(url) || isVideoUrl(url) || isAudioUrl(url))
  }

  // Enhanced markdown renderer with media support
  const MarkdownRenderer = ({ content }: { content: string }) => {
    const mediaUrls = extractMediaUrls(content)
    
    return (
      <div className="prose prose-sm max-w-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight, rehypeRaw]}
          components={{
            // Custom code rendering
            code(props: any) {
              const { node, inline, className, children, ...rest } = props
              const match = /language-(\w+)/.exec(className || '')
              return !inline && match ? (
                <pre className="bg-gray-100 rounded p-3 overflow-x-auto">
                  <code className={className} {...rest}>
                    {children}
                  </code>
                </pre>
              ) : (
                <code className="bg-gray-100 px-1 py-0.5 rounded text-sm" {...rest}>
                  {children}
                </code>
              )
            },
            // Custom image rendering
            img(props: any) {
              const { src, alt, ...rest } = props
              return (
                <img
                  src={src}
                  alt={alt}
                  className="max-w-full h-auto rounded-lg shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => window.open(src, '_blank')}
                  {...rest}
                />
              )
            },
            // Custom link rendering
            a(props: any) {
              const { href, children, ...rest } = props
              return (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:text-primary-700 underline"
                  {...rest}
                >
                  {children}
                </a>
              )
            }
          }}
        >
          {content}
        </ReactMarkdown>
        
        {/* Render media attachments */}
        {mediaUrls.length > 0 && (
          <div className="mt-3 space-y-2">
            {mediaUrls.map((url, idx) => (
              <div key={idx} className="border rounded-lg p-2 bg-gray-50">
                {isImageUrl(url) && (
                  <div>
                    <img
                      src={url}
                      alt="Attached image"
                      className="max-w-full h-auto rounded cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => window.open(url, '_blank')}
                    />
                  </div>
                )}
                {isVideoUrl(url) && (
                  <video
                    src={url}
                    controls
                    className="max-w-full h-auto rounded"
                    preload="metadata"
                  />
                )}
                {isAudioUrl(url) && (
                  <audio
                    src={url}
                    controls
                    className="w-full"
                    preload="metadata"
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center">
              <span className="text-white font-semibold text-sm">T</span>
            </div>
            <div>
              <h1 className="font-semibold text-gray-900">Tobi Chat</h1>
              <p className="text-xs text-gray-500">
                {selectedUser ? `Chatting with ${selectedUser.display_name}` : 'AI Sales Copilot'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            {/* User Selector */}
            <div className="relative">
              <button
                onClick={() => setShowUserSelector(!showUserSelector)}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
                title="Select user"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </button>

              {showUserSelector && (
                <div className="absolute top-full right-0 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                  {loadingUsers ? (
                    <div className="px-3 py-2 text-xs text-gray-500">Loading users...</div>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setSelectedUser(null)
                          setShowUserSelector(false)
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-gray-50 focus:bg-gray-50 focus:outline-none border-b border-gray-100"
                      >
                        <div className="text-xs text-gray-500">Anonymous Chat</div>
                      </button>
                      {users.map((user) => (
                        <button
                          key={user.id}
                          onClick={() => {
                            setSelectedUser(user)
                            setShowUserSelector(false)
                          }}
                          className={`w-full px-3 py-2 text-left hover:bg-gray-50 focus:bg-gray-50 focus:outline-none ${
                            selectedUser?.id === user.id ? 'bg-primary-100 border-l-4 border-primary-500' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-xs font-medium text-gray-900">{user.display_name}</div>
                              <div className="text-xs text-gray-500">{user.email}</div>
                            </div>
                            <span className={`px-1.5 py-0.5 text-xs font-medium rounded-full ${
                              user.user_type === 'employee' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                            }`}>
                              {user.user_type}
                            </span>
                          </div>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Conversation History */}
            {selectedUser && (
              <div className="relative">
                <button
                  onClick={() => setShowConversationHistory(!showConversationHistory)}
                  className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
                  title="Conversation history"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>

                {showConversationHistory && (
                  <div className="absolute top-full right-0 mt-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
                    {loadingConversations ? (
                      <div className="px-3 py-2 text-xs text-gray-500">Loading conversations...</div>
                    ) : conversations.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-gray-500">No conversations found</div>
                    ) : (
                      conversations.map((conv) => (
                        <button
                          key={conv.id}
                          onClick={() => {
                            setSelectedConversation(conv)
                            setShowConversationHistory(false)
                          }}
                          className={`w-full px-3 py-2 text-left hover:bg-gray-50 focus:bg-gray-50 focus:outline-none ${
                            selectedConversation?.id === conv.id ? 'bg-primary-100 border-l-4 border-primary-500' : ''
                          }`}
                        >
                          <div className="text-xs font-medium text-gray-900">
                            {conv.title || `Conversation ${conv.id.substring(0, 8)}...`}
                          </div>
                          <div className="text-xs text-gray-500">
                            {new Date(conv.updated_at).toLocaleDateString()} at {new Date(conv.updated_at).toLocaleTimeString()}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            {/* New Conversation */}
            <button
              onClick={clearConversation}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
              title="New conversation"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Welcome to Tobi Chat</h2>
            <p className="text-gray-600 text-sm max-w-sm mx-auto">
              I'm your AI sales copilot. Ask me anything about sales, customers, or let me help you with your workflow.
            </p>
          </div>
        )}

        {messages.map((message) => {
          const chatMessage = message as ChatMessage
          const hasError = chatMessage.error || chatMessage.metadata?.type === 'error'
          
          return (
            <div
              key={message.id}
              className={clsx(
                'flex w-full',
                message.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              <div
                className={clsx(
                  'max-w-[85%] sm:max-w-md rounded-2xl px-4 py-3 text-sm',
                  message.role === 'user'
                    ? 'bg-primary-600 text-white ml-auto'
                    : hasError
                    ? 'bg-red-50 border border-red-200 text-red-900'
                    : 'bg-white border border-gray-200 shadow-sm'
                )}
              >
                <MarkdownRenderer content={message.content} />
                
                {/* Error indicator */}
                {hasError && (
                  <div className="mt-2 pt-2 border-t border-red-200">
                    <div className="flex items-center space-x-2">
                      <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-xs text-red-600 font-medium">
                        Error: {chatMessage.error_type || chatMessage.metadata?.error_type || 'Unknown'}
                      </span>
                    </div>
                  </div>
                )}
                
                {/* Sources for assistant messages */}
                {message.role === 'assistant' && chatMessage.sources && chatMessage.sources.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="text-xs text-gray-500 mb-2 font-medium">📚 Sources ({chatMessage.sources.length}):</p>
                    <div className="space-y-1">
                      {chatMessage.sources.map((source, idx) => (
                        <div key={idx} className="text-xs bg-gray-50 rounded p-2">
                          {source.url ? (
                            <a 
                              href={source.url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-primary-600 hover:text-primary-700 underline font-medium"
                            >
                              {source.title || source.url}
                            </a>
                          ) : (
                            <span className="text-gray-700 font-medium">{source.title || 'Document'}</span>
                          )}
                          {source.relevance_score && (
                            <span className="ml-2 text-gray-500 text-xs">
                              ({Math.round(source.relevance_score * 100)}% relevant)
                            </span>
                          )}
                          {source.content && (
                            <p className="text-gray-600 mt-1 text-xs">
                              {source.content.substring(0, 100)}...
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* HITL (Human-in-the-loop) indicator */}
                {message.role === 'assistant' && (chatMessage.is_interrupted || chatMessage.metadata?.type === 'hitl_interrupt') && (
                  <div className="mt-3 pt-3 border-t border-amber-100">
                    <div className="bg-amber-50 -mx-2 px-3 py-2 rounded-lg">
                      <div className="flex items-center space-x-2 mb-2">
                        <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></div>
                        <span className="text-xs text-amber-700 font-semibold">Human approval required</span>
                      </div>
                      {chatMessage.hitl_phase && (
                        <p className="text-xs text-amber-600 mb-2">
                          Phase: <span className="font-medium">{chatMessage.hitl_phase}</span>
                        </p>
                      )}
                      {hitlState.isActive && hitlState.conversationId === conversationId && (
                        <div className="flex space-x-2 mt-3">
                          <button
                            onClick={() => handleHitlApproval(true)}
                            className="flex-1 bg-green-600 text-white text-xs py-2 px-3 rounded-lg hover:bg-green-700 transition-colors font-medium"
                          >
                            ✓ Approve
                          </button>
                          <button
                            onClick={() => handleHitlApproval(false)}
                            className="flex-1 bg-red-600 text-white text-xs py-2 px-3 rounded-lg hover:bg-red-700 transition-colors font-medium"
                          >
                            ✗ Deny
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3 shadow-sm">
              <div className="flex items-center space-x-2">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
                <span className="text-xs text-gray-500">Tobi is thinking...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Error display */}
      {error && (
        <div className="mx-4 mb-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">
            Something went wrong. Please try again.
          </p>
        </div>
      )}

      {/* HITL Status Bar */}
      {hitlState.isActive && (
        <div className="bg-amber-50 border-t border-amber-200 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-amber-500 rounded-full animate-pulse"></div>
              <div>
                <p className="text-sm font-medium text-amber-800">Waiting for approval</p>
                <p className="text-xs text-amber-600">Phase: {hitlState.phase}</p>
              </div>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => handleHitlApproval(true)}
                className="bg-green-600 text-white text-sm py-1 px-3 rounded-lg hover:bg-green-700 transition-colors"
              >
                Approve
              </button>
              <button
                onClick={() => handleHitlApproval(false)}
                className="bg-red-600 text-white text-sm py-1 px-3 rounded-lg hover:bg-red-700 transition-colors"
              >
                Deny
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="bg-white border-t border-gray-200 p-4">
        <form onSubmit={handleSubmit} className="flex items-end space-x-3">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={hitlState.isActive 
                ? "HITL mode active - use approval buttons above or type 'approve'/'deny'" 
                : selectedUser
                ? "Type a message..."
                : "Please select a user first..."
              }
              disabled={isLoading || !selectedUser}
              className={clsx(
                "w-full resize-none border rounded-2xl px-4 py-3 pr-12 text-sm focus:outline-none focus:ring-2 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed",
                hitlState.isActive
                  ? "border-amber-300 focus:ring-amber-500 bg-amber-50"
                  : "border-gray-300 focus:ring-primary-500"
              )}
              rows={1}
              style={{ minHeight: '44px', maxHeight: '120px' }}
            />
          </div>
          <button
            type="submit"
            disabled={!input.trim() || isLoading || !selectedUser}
            className={clsx(
              'flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-all',
              input.trim() && !isLoading
                ? hitlState.isActive
                  ? 'bg-amber-600 text-white hover:bg-amber-700 shadow-md'
                  : 'bg-primary-600 text-white hover:bg-primary-700 shadow-md'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            )}
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
          </button>
        </form>
        
        {/* Status and ID display */}
        <div className="mt-2 text-xs text-gray-400 text-center flex items-center justify-center space-x-4">
          <span>ID: {conversationId.substring(0, 8)}...</span>
          {hitlState.isActive && (
            <span className="text-amber-600 font-medium">● HITL Active</span>
          )}
          {lastSources.length > 0 && (
            <span className="text-blue-600">📚 {lastSources.length} sources</span>
          )}
        </div>
      </div>
    </div>
  )
}