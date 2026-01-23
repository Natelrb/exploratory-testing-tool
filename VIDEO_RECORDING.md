# Video Recording Feature

## Overview

Video recording functionality has been added to capture the full browser session during AI-powered explorations. This provides richer context for debugging and reviewing test runs.

## Implementation Details

### Configuration (src/config/index.ts)
- Added `recordVideo: boolean` - Enable/disable video recording (default: false)
- Added `videoSize: { width, height }` - Video resolution (default: 1280x720)
- Controlled via `RECORD_VIDEO=true` environment variable

### Engine Changes (src/lib/explorer/engine.ts)

#### Browser Context Setup (line ~195)
- Conditionally adds `recordVideo` option to Playwright browser context
- Videos are automatically recorded to the evidence directory
- Uses configured video size for optimal file size vs quality

#### Evidence Collection (line ~2064)
- After exploration completes, retrieves the video file from Playwright
- Moves video to consistent location: `exploration-recording.webm`
- Creates database record in `ExplorationEvidence` table with type: "video"
- Captures metadata: file size (bytes and MB), format (webm)
- Handles errors gracefully - logs warning if video save fails

### UI Enhancement (src/components/ExplorationDetailClient.tsx)

#### Video Player (line ~450)
- Embedded HTML5 video player for in-browser viewing
- Controls for play/pause, seek, volume
- Preloads metadata for faster display
- Download link for offline viewing
- Responsive aspect-ratio container

## Usage

### Enable Video Recording

1. Add to `.env` file:
   ```env
   RECORD_VIDEO="true"
   ```

2. Restart development server:
   ```bash
   npm run dev
   ```

3. Run an exploration - video will be automatically recorded

### View Videos

1. Navigate to exploration results
2. Click "Evidence" tab
3. Video player will show the full recording
4. Click "Download video" to save locally

## Technical Specifications

- **Format**: WebM (Playwright default)
- **Resolution**: 1280x720 (configurable)
- **File Size**: ~2-5MB per minute
- **Storage**: `/public/evidence/{runId}/exploration-recording.webm`
- **Database**: `ExplorationEvidence` table with type="video"

## Benefits

1. **Complete Context** - See entire interaction flow, not just snapshots
2. **Timing Issues** - Capture loading states, animations, race conditions
3. **Better Debugging** - Watch exactly what happened during exploration
4. **Stakeholder Reports** - Share video evidence with team members

## Considerations

- Videos increase storage requirements (~2-5MB/min vs ~100KB per screenshot)
- Slight performance overhead (~5-10%) during recording
- Opt-in by default to avoid unexpected storage growth
- Video finalization happens on page close (automatic in cleanup flow)

## Future Enhancements

Potential improvements:
- Configurable video quality/bitrate settings
- Frame rate control for smaller files
- MP4 conversion for better browser compatibility
- Per-action video clips (similar to screenshots)
- Video thumbnail generation for quick preview
