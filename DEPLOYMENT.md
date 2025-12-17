# Deployment Guide for D&D AI Dungeon Master

## Prerequisites

### Required Services
- **Supabase** - Database and authentication
- **Google Gemini API** - AI scenario generation
- **Runware API** - Map image generation
- **Redis** (optional) - Caching and session storage

### Environment Variables

Create a `.env` file with the following variables:

```env
# Session Security
SESSION_SECRET="your-secure-session-secret-here"

# Google Gemini API
GEMINI_API_KEY="your-gemini-api-key"

# Runware API
RUNWARE_API_KEY="your-runware-api-key"

# Supabase Configuration
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_ANON_KEY="your-supabase-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-supabase-service-role-key"

# Database
DATABASE_URL="postgresql://user:password@host:port/database"

# Redis (Optional)
REDIS_URL="redis://username:password@host:port"

# FreePik API (for map generation)
X_FREEPIK_API_KEY="your-freepik-api-key"
```

## Database Setup

### Run Migrations
```bash
# Navigate to your project directory
cd your-project-directory

# Run database migrations
# Note: Ensure your Supabase database is configured and accessible
# The migration files are in the /migrations directory
```

### Required Tables
Ensure the following tables exist in your Supabase database:
- `rooms` - Game room management
- `characters` - Character storage
- `room_scenario_votes` - Voting system
- `scenario_suggestions` - User suggestions
- `room_chat_messages` - Chat functionality

## Build and Deployment

### Local Development
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Application will be available at http://localhost:5173
```

### Production Build
```bash
# Build for production
npm run build

# Start production server
npm start

# Application will be available at http://localhost:3000
```

## Netlify Deployment

This project is configured for Netlify deployment:

1. **Connect Repository**
   - Push your code to a GitHub repository
   - In Netlify, create a new site and connect your GitHub repository

2. **Environment Variables**
   - Go to Site settings > Environment variables
   - Add all required environment variables from the `.env` file

3. **Build Settings**
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Build image: Use the latest Node.js version

4. **Deploy**
   - Trigger a manual deploy or set up automatic deployments on push

## GitHub Repository Setup

### Before Pushing to GitHub

1. **Update README.md**
   ```markdown
   # Your D&D AI Dungeon Master App
   
   A web-based D&D character and campaign management tool with AI-powered scenario generation.
   
   ## Features
   
   - 🎲 Character Management
   - 🗺️ Scenario Generation with Maps
   - 👥 Multiplayer Room System
   - 🎯 Voting System
   - 🎲 Dice Rolling
   - 💬 Chat Integration
   
   ## Installation
   
   1. Clone the repository
   2. Install dependencies: `npm install`
   3. Set up environment variables
   4. Run migrations
   5. Start development server: `npm run dev`
   ```

2. **Create .gitignore**
   Ensure your `.gitignore` includes:
   ```
   node_modules/
   .env
   *.log
   dist/
   .vite/
   ```

3. **Push to GitHub**
   ```bash
   # Initialize git if not already done
   git init
   
   # Add all files
   git add .
   
   # Commit changes
   git commit -m "Initial commit: D&D AI Dungeon Master application"
   
   # Add your GitHub repository
   git remote add origin https://github.com/yourusername/your-repo.git
   
   # Push to GitHub
   git push -u origin main
   ```

## Security Considerations

### API Keys Protection
- Never commit `.env` files to version control
- Use environment variables in production
- Rotate API keys regularly
- Set up API key restrictions in provider dashboards

### Database Security
- Enable Row Level Security (RLS) in Supabase
- Use proper authentication rules
- Limit database access with service roles

### Session Security
- Use strong, unique session secrets in production
- Set appropriate session timeouts
- Enable HTTPS in production

## Monitoring and Maintenance

### Error Monitoring
- Set up error tracking (Sentry, LogRocket, etc.)
- Monitor API usage and quotas
- Track user engagement metrics

### Performance Monitoring
- Monitor database query performance
- Check API response times
- Optimize image loading for maps

### Regular Maintenance
- Update dependencies regularly
- Monitor API key usage and quotas
- Review database storage and performance
- Clean up unused resources

## Troubleshooting

### Common Issues

1. **Build Failures**
   - Check Node.js version compatibility
   - Verify all dependencies are installed
   - Check for TypeScript compilation errors

2. **Database Connection Issues**
   - Verify Supabase URL and keys
   - Check network connectivity
   - Ensure RLS policies are configured

3. **API Key Issues**
   - Verify API keys are valid
   - Check rate limits and quotas
   - Ensure proper API permissions

4. **Environment Variables**
   - Verify all required variables are set
   - Check for typos in variable names
   - Ensure proper formatting

### Getting Help

- Check the application logs for error details
- Review browser console for client-side errors
- Verify all external service connections
- Check Supabase dashboard for database issues

## Production Checklist

- [ ] All environment variables configured
- [ ] Database migrations completed
- [ ] SSL/HTTPS enabled
- [ ] Error monitoring set up
- [ ] Performance monitoring configured
- [ ] Backup strategy implemented
- [ ] Security measures verified
- [ ] API rate limits monitored
- [ ] Documentation updated
- [ ] Team access configured

---

For support or questions, please check the project documentation or create an issue on GitHub.
