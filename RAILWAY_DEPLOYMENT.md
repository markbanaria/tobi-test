# Railway Deployment Guide

This guide will help you deploy your RAG application to Railway.

## Prerequisites

1. **Railway Account**: Sign up at [railway.app](https://railway.app)
2. **GitHub Repository**: Your code should be in a GitHub repository
3. **Required Services**:
   - Supabase (already configured)
   - OpenAI API key
   - Spider API key (if using web scraping)

## Deployment Steps

### 1. Create a New Railway Project

1. Log in to Railway
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Connect your GitHub account and select this repository

**Important**: Railway may try to use Nixpacks instead of Docker. The `nixpacks.toml` files in this repo force Railway to use Docker instead.

### 2. Deploy Backend Service

1. Railway will automatically detect your project structure
2. Create a new service for the backend:
   - Click "Add Service" → "GitHub Repo"
   - Name it "backend"
   - Set the source to your repository
   - Railway will use the `backend/Dockerfile` automatically

#### Backend Environment Variables

Add these environment variables to your backend service:

```bash
# Required
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_CHAT_MODEL=gpt-4o-mini
OPENAI_MAX_TOKENS=4000
OPENAI_TEMPERATURE=0.3

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_supabase_service_key
SUPABASE_DB_PASSWORD=your_supabase_password

SPIDER_API_KEY=your_spider_api_key

# System
ENVIRONMENT=production
LOG_LEVEL=INFO

# Will be set automatically by Railway
PORT=8000

# CORS (set after frontend is deployed)
FASTAPI_CORS_ORIGINS=["https://your-frontend-domain.railway.app"]
```

### 3. Deploy Frontend Service

1. Create another service for the frontend:
   - Click "Add Service" → "GitHub Repo"
   - Name it "frontend"
   - Set the source to your repository
   - Railway will use the `frontend/Dockerfile` automatically

#### Frontend Environment Variables

Add these environment variables to your frontend service:

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# API URL (set to your backend Railway URL)
NEXT_PUBLIC_API_URL=https://your-backend-domain.railway.app

# System
NODE_ENV=production
PORT=3000
```

### 4. Add Redis Service (Optional)

If you need Redis for caching:

1. Click "Add Service" → "Database" → "Add Redis"
2. Railway will provide a `REDIS_URL` environment variable
3. Add `REDIS_URL` to your backend service environment variables

### 5. Configure Domain Names

1. **Backend Service**:
   - Go to Settings → Networking
   - Generate a domain or add your custom domain
   - Copy the domain URL

2. **Frontend Service**:
   - Go to Settings → Networking
   - Generate a domain or add your custom domain
   - Copy the domain URL

### 6. Update Environment Variables

1. Update backend `FASTAPI_CORS_ORIGINS` with frontend domain
2. Update frontend `NEXT_PUBLIC_API_URL` with backend domain

### 7. Deploy and Test

1. Both services should automatically deploy when you push to GitHub
2. Check the deployment logs for any errors
3. Test your application at the frontend domain

## File Structure for Railway

Your project should have this structure:

```
agent-tobi-rag/
├── backend/
│   ├── Dockerfile              # Production Dockerfile for backend
│   ├── Dockerfile.dev          # Development Dockerfile
│   ├── requirements.txt
│   ├── main.py
│   └── ... (other backend files)
├── frontend/
│   ├── Dockerfile              # Production Dockerfile for frontend
│   ├── Dockerfile.dev          # Development Dockerfile
│   ├── package.json
│   ├── next.config.js          # Updated with standalone output
│   └── ... (other frontend files)
├── railway.json                # Railway configuration
├── railway.env.example         # Environment variables template
└── RAILWAY_DEPLOYMENT.md       # This file
```

## Environment Variables Setup

### Backend Service Environment Variables

Copy from `railway.env.example` and set in Railway dashboard:

- `OPENAI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_KEY`
- `SPIDER_API_KEY`
- `FASTAPI_CORS_ORIGINS` (include your frontend domain)

### Frontend Service Environment Variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_API_URL` (your backend domain)

## Troubleshooting

### Common Issues

1. **Nixpacks Build Failures**:
   - If you see "Nixpacks build failed" or "No start command could be found"
   - Ensure `nixpacks.toml` files are present in root, backend, and frontend directories
   - These files force Railway to use Docker instead of Nixpacks
   - Try redeploying after pushing these config files

2. **Build Failures**:
   - Check the build logs in Railway dashboard
   - Ensure Dockerfiles are properly configured
   - Verify all required files are in the repository

2. **Environment Variables**:
   - Double-check all environment variables are set
   - Ensure no trailing spaces or special characters
   - Frontend vars must start with `NEXT_PUBLIC_`

3. **CORS Issues**:
   - Verify `FASTAPI_CORS_ORIGINS` includes your frontend domain
   - Check that domains are correctly formatted (https://)

4. **Database Connection**:
   - Ensure Supabase credentials are correct
   - Check if Supabase allows connections from Railway's IP ranges

### Monitoring and Logs

- Use Railway's built-in logging to debug issues
- Monitor both services' logs during deployment
- Check health endpoints: `/health` for backend

## Production Checklist

- [ ] Backend service deployed and running
- [ ] Frontend service deployed and running
- [ ] All environment variables configured
- [ ] CORS properly configured
- [ ] Database connections working
- [ ] Health checks passing
- [ ] Custom domains configured (optional)
- [ ] SSL certificates active

## Cost Optimization

- Railway offers $5/month of free usage
- Monitor your usage in the Railway dashboard
- Consider using Railway's sleep feature for development environments

## Updates and CI/CD

Railway automatically redeploys when you push to your connected GitHub repository:

1. Push changes to GitHub
2. Railway detects changes and triggers build
3. Services are redeployed automatically

For production, consider using branches and Railway's PR deployment features.