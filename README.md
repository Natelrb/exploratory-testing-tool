# Exploratory Testing Tool

A web-based application for session-based exploratory testing, combining manual testing workflows with AI-powered automated exploration. Inspired by Elisabeth Hendrickson's *Explore It!* methodology.

## Features

### Manual Exploratory Testing
- **Quick Session Setup** - Start testing sessions with minimal friction
- **Charter-Based Testing** - Define test charters with mission, risk focus, and scope
- **Real-Time Note Capture** - Keyboard shortcuts for rapid note-taking during sessions
- **Session Timer** - Track time spent on exploration
- **Structured Debrief** - Capture outcomes, bugs found, and session insights
- **Session History** - Review and analyze past testing sessions

### AI-Powered Exploration
- **Automated Browser Testing** - Playwright-based browser automation
- **Intelligent Page Analysis** - AI analyzes page structure and identifies test opportunities
- **Auto-Generated Test Charters** - AI creates testing charters based on application analysis
- **Evidence Collection** - Automatic screenshots, console logs, and network traffic capture
- **Issue Detection** - AI identifies potential bugs, accessibility issues, and UX problems
- **Multi-Step Login Support** - Handles complex authentication flows

### AI Providers
- **Ollama (Local)** - Privacy-focused local LLM support (recommended: qwen2.5:14b)
- **Heuristic Fallback** - Rule-based analysis when no LLM is available

## Tech Stack

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **Database**: SQLite with Prisma ORM
- **Browser Automation**: Playwright
- **AI Integration**: Ollama (local LLM)
- **Styling**: Tailwind CSS

## Prerequisites

- Node.js 18+
- npm or yarn
- (Optional) [Ollama](https://ollama.ai/) for AI-powered exploration

## Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/exploratory-testing-tool.git
   cd exploratory-testing-tool
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Install Playwright browsers**
   ```bash
   npx playwright install chromium
   ```

4. **Set up the database**
   ```bash
   npx prisma generate
   npx prisma db push
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```

6. **Open the app**
   Navigate to [http://localhost:3000](http://localhost:3000)

## Optional: AI Setup with Ollama

For enhanced AI-powered exploration:

1. **Install Ollama**
   ```bash
   # macOS
   brew install ollama

   # Or download from https://ollama.ai/
   ```

2. **Pull a recommended model**
   ```bash
   ollama pull qwen2.5:14b
   ```

3. **Start Ollama**
   ```bash
   ollama serve
   ```

The app will automatically detect and use Ollama when available.

## Usage

### Manual Testing Sessions

1. **Start a Session** - Click "New Session" and fill in:
   - Product Area (e.g., "Checkout Flow")
   - Build/Version being tested
   - Test Charter with mission and focus areas

2. **During the Session** - Use keyboard shortcuts:
   - `Ctrl/Cmd + B` - Log a bug
   - `Ctrl/Cmd + Q` - Log a question
   - `Ctrl/Cmd + I` - Log an idea
   - `Ctrl/Cmd + N` - Log a general note

3. **Debrief** - End the session and capture:
   - Bugs found
   - Questions raised
   - Ideas for future testing
   - Overall session outcome

### AI Explorer

1. **Start Exploration** - Go to "AI Explorer" and enter:
   - URL to explore
   - Optional: Login credentials for authenticated areas
   - Choose headless or visible browser mode

2. **Monitor Progress** - Watch as the AI:
   - Analyzes page structure
   - Generates test charter
   - Plans exploration steps
   - Executes actions and captures evidence

3. **Review Results** - Examine:
   - Actions taken with before/after screenshots
   - Findings and recommendations
   - Console and network logs
   - Full evidence archive

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── api/               # API routes
│   │   ├── ai/           # AI status endpoint
│   │   └── explore/      # Exploration API (start, stop)
│   ├── debrief/          # Session debrief page
│   ├── explore/          # AI Explorer pages
│   ├── history/          # Session history
│   └── session/          # Live session page
├── components/            # React components
├── lib/
│   ├── actions/          # Server actions
│   ├── ai/               # AI provider implementations
│   │   ├── index.ts      # Provider factory
│   │   ├── ollama-provider.ts
│   │   └── heuristic-provider.ts
│   ├── db.ts             # Prisma client
│   └── explorer/         # Browser automation engine
│       ├── engine.ts     # Main exploration orchestrator
│       ├── manager.ts    # Exploration lifecycle management
│       └── types.ts      # Type definitions
└── generated/            # Prisma generated types
```

## Database Schema

### Manual Testing
- **ProductArea** - Areas of the product being tested
- **Build** - Version/build information
- **Charter** - Test charter with mission and scope
- **Session** - Testing session with timer and notes
- **Note** - Observations captured during testing
- **Outcome** - Session results (pass/fail/blocked)

### AI Exploration
- **ExplorationRun** - AI exploration session
- **ExplorationAction** - Individual actions taken
- **ExplorationFinding** - Issues and observations found
- **ExplorationEvidence** - Screenshots, logs, artifacts
- **ExplorationLog** - Detailed execution logs

## Configuration

### Environment Variables

Create a `.env` file for optional configuration:

```env
# Database (default: ./prisma/dev.db)
DATABASE_URL="file:./dev.db"

# Ollama (default: http://localhost:11434)
OLLAMA_BASE_URL="http://localhost:11434"
```

## Screenshots

### Manual Testing Session
*Start a new exploratory testing session with charter-based approach*

### AI Explorer Dashboard
*Monitor AI-powered exploration with real-time progress*

### Evidence Review
*Review screenshots and findings from automated exploration*

## Contributing

This is a private repository. For internal contributions:

1. Create a feature branch
2. Make your changes
3. Submit a pull request for review

## License

Private - All rights reserved.

## Acknowledgments

- Inspired by Elisabeth Hendrickson's [Explore It!](https://pragprog.com/titles/ehxta/explore-it/)
- Built with [Next.js](https://nextjs.org/), [Prisma](https://www.prisma.io/), and [Playwright](https://playwright.dev/)
- AI powered by [Ollama](https://ollama.ai/)
