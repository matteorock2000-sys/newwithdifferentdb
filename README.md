# D&D AI Dungeon Master

A web-based D&D character and campaign management tool with AI-powered scenario generation, multiplayer support, and comprehensive error handling.

## 🎯 Features

- 🎲 **Character Management**: Create, import, and manage D&D characters
- 🗺️ **AI Scenario Generation**: Generate custom adventures with AI and maps
- 👥 **Multiplayer Rooms**: Real-time collaboration with voting systems
- 🎲 **Dice Rolling**: Built-in dice system with 3D visualization
- 💬 **Chat Integration**: Real-time communication in game rooms
- 🛡️ **Comprehensive Error Handling**: Graceful degradation and user-friendly error messages
- 🔄 **Optimistic Updates**: Smooth user experience with real-time synchronization

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Access to Supabase (for database)
- Google Gemini API key (for AI features)
- Runware API key (for map generation)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/dnd-ai-dungeon-master.git
   cd dnd-ai-dungeon-master
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys and database connection
   ```

4. **Run database migrations**
   ```bash
   # Run your migration scripts or set up Supabase manually
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```

6. **Open your browser**
   Visit http://localhost:5173

## 📋 Environment Variables

Required environment variables:

```env
SESSION_SECRET="your-secure-session-secret"
GEMINI_API_KEY="your-gemini-api-key"
RUNWARE_API_KEY="your-runware-api-key"
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_ANON_KEY="your-supabase-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-supabase-service-role-key"
DATABASE_URL="postgresql://user:password@host:port/database"
X_FREEPIK_API_KEY="your-freepik-api-key"
```

## 🏗️ Architecture

### Tech Stack
- **Frontend**: React 18 + TypeScript
- **Framework**: Remix.run
- **Styling**: Tailwind CSS
- **Database**: Supabase/PostgreSQL
- **Authentication**: Supabase Auth
- **Real-time**: Supabase Realtime
- **AI**: Google Gemini API
- **Maps**: Runware API + FreePik

### Key Features
- **Error Handling**: Standardized error responses with retry logic
- **Offline Support**: Graceful degradation when offline
- **Real-time Updates**: Live voting and chat functionality
- **Multiplayer**: Support for up to 4 players per room
- **AI Integration**: Scenario generation and image creation

## 🎮 Usage

1. **Create a Room**: Click "Create Room" and share the code with friends
2. **Create Characters**: Each player creates or imports their character
3. **Generate Scenarios**: Host generates AI-powered adventure scenarios
4. **Vote on Scenarios**: Players vote on which scenario to play
5. **Start Adventure**: Begin your D&D campaign with custom maps!

## 🚀 Deployment

### Netlify (Recommended)
This project is pre-configured for Netlify deployment:

1. Push to GitHub
2. Connect repository to Netlify
3. Set environment variables in Netlify dashboard
4. Deploy!

### Manual Deployment
```bash
# Build for production
npm run build

# Start production server
npm start
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

## 🔧 Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run typecheck` - Run TypeScript checks
- `npm run lint` - Run ESLint
- `npm run gemini` - Run Gemini CLI tool

### Project Structure

```
├── app/                    # Application code
│   ├── components/         # React components
│   ├── routes/            # Remix routes
│   ├── services/          # Backend services
│   ├── utils/             # Utility functions
│   └── types/             # TypeScript definitions
├── migrations/            # Database migrations
├── public/               # Static assets
└── test/                 # Test files
```

## 🛠️ Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run linting and type checking
6. Submit a pull request

## 🐛 Error Handling

This application features comprehensive error handling:

- **Network Failures**: Automatic retry with exponential backoff
- **API Limits**: Graceful degradation when quotas exceeded
- **Database Errors**: User-friendly error messages
- **Offline Mode**: Continued functionality when possible
- **Validation**: Proper input validation and error reporting

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🤝 Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/dnd-ai-dungeon-master/issues)
- **Documentation**: [DEPLOYMENT.md](./DEPLOYMENT.md)
- **Contributing**: See [CONTRIBUTING.md](./CONTRIBUTING.md)

---

**Note**: This application requires API keys for Google Gemini and Runware services. Please ensure you have the necessary permissions and API access before using.
