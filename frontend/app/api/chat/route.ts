import { StreamingTextResponse } from 'ai'
import { NextRequest, NextResponse } from 'next/server'

// Types matching the backend API
interface MessageRequest {
  message: string
  conversation_id?: string
  user_id?: string
  include_sources?: boolean
}

interface ChatResponse {
  message: string
  sources?: Array<{
    title?: string
    url?: string
    content?: string
    relevance_score?: number
  }>
  is_interrupted?: boolean
  conversation_id: string
  confirmation_id?: string
  error?: boolean
  error_type?: string
  // HITL 3-field architecture
  hitl_phase?: string
  hitl_prompt?: string
  hitl_context?: any
}

export async function POST(req: NextRequest) {
  try {
    const { messages, conversation_id, user_id, isHitlResponse = false } = await req.json()
    
    // Get the latest user message
    const userMessage = messages[messages.length - 1]?.content || ''
    
    console.log(`🔍 [FRONTEND_API] Processing message: "${userMessage.substring(0, 50)}..."`)
    console.log(`🔍 [FRONTEND_API] Conversation ID: ${conversation_id}`)
    console.log(`🔍 [FRONTEND_API] User ID: ${user_id}`)
    console.log(`🔍 [FRONTEND_API] Is HITL Response: ${isHitlResponse}`)

    // Prepare request to backend matching the MessageRequest model
    const backendUrl = process.env.BACKEND_URL || 'http://backend:8000' // Use Docker service name
    const requestBody: MessageRequest = {
      message: userMessage,
      conversation_id: conversation_id,
      user_id: user_id || '54394d40-ad35-4b5b-a392-1ae7c9329d11', // Use provided user_id or fallback to Alex Thompson
      include_sources: true
    }

    console.log(`🔍 [FRONTEND_API] Calling backend: ${backendUrl}/api/v1/chat/message`)

    // Call backend chat API
    const response = await fetch(`${backendUrl}/api/v1/chat/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      console.error(`🔍 [FRONTEND_API] Backend API error: ${response.status}`)
      throw new Error(`Backend API error: ${response.status}`)
    }

    const data: ChatResponse = await response.json()
    
    console.log(`🔍 [FRONTEND_API] Backend response - Interrupted: ${data.is_interrupted}, Error: ${data.error}`)
    console.log(`🔍 [FRONTEND_API] HITL Phase: ${data.hitl_phase}`)

    // Handle HITL (Human-in-the-loop) interruptions - return as JSON, not stream
    if (data.is_interrupted) {
      console.log(`🔍 [FRONTEND_API] HITL INTERRUPT detected`)
      
      return NextResponse.json({
        role: 'assistant',
        content: data.message,
        sources: data.sources || [],
        is_interrupted: true,
        conversation_id: data.conversation_id,
        hitl_phase: data.hitl_phase,
        hitl_prompt: data.hitl_prompt,
        hitl_context: data.hitl_context,
        metadata: {
          type: 'hitl_interrupt',
          phase: data.hitl_phase
        }
      })
    }

    // Handle errors - return as JSON, not stream
    if (data.error) {
      console.log(`🔍 [FRONTEND_API] ERROR detected: ${data.error_type}`)
      
      return NextResponse.json({
        role: 'assistant',
        content: data.message,
        conversation_id: data.conversation_id,
        error: true,
        error_type: data.error_type,
        metadata: {
          type: 'error',
          error_type: data.error_type
        }
      }, { status: 400 })
    }

    // Normal response - return as streaming text for useChat compatibility
    console.log(`🔍 [FRONTEND_API] Normal response, creating stream from complete message`)
    
    // Create a simple streaming response that immediately sends the complete message
    // This makes useChat happy while handling complex content properly
    const encoder = new TextEncoder()
    const message = data.message
    
    const stream = new ReadableStream({
      start(controller) {
        // Send the complete message immediately 
        controller.enqueue(encoder.encode(message))
        
        // Add sources as embedded data if available
        if (data.sources && data.sources.length > 0) {
          controller.enqueue(encoder.encode(`\n\n__SOURCES__${JSON.stringify(data.sources)}`))
        }
        
        controller.close()
      }
    })
    
    return new StreamingTextResponse(stream, {
      headers: {
        'X-Conversation-ID': data.conversation_id,
        'X-Has-Sources': (data.sources && data.sources.length > 0).toString(),
        'X-Sources': data.sources ? JSON.stringify(data.sources) : '[]'
      }
    })
    
  } catch (error) {
    console.error('🔍 [FRONTEND_API] Chat API error:', error)
    
    // Check if it's a connection error
    const isConnectionError = error instanceof Error && (
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('fetch failed') ||
      error.message.includes('Backend API error')
    )
    
    if (isConnectionError) {
      return NextResponse.json({
        role: 'assistant',
        content: '🔧 **Backend Connection Issue**\n\nI\'m having trouble connecting to the backend services. This could mean:\n\n- The backend container is starting up (please wait a moment)\n- There\'s a configuration issue with the services\n- The backend has dependencies that need to be installed\n\nPlease try again in a few moments, or check the Docker logs for more details.',
        error: true,
        error_type: 'backend_connection_error',
        metadata: {
          type: 'error',
          error_type: 'backend_connection_error'
        }
      }, { status: 503 }) // Service Unavailable
    }
    
    return NextResponse.json({
      role: 'assistant',
      content: 'I apologize, but I encountered a technical issue. Please try again.',
      error: true,
      error_type: 'general_error',
      metadata: {
        type: 'error',
        error_type: 'general_error'
      }
    }, { status: 500 })
  }
}