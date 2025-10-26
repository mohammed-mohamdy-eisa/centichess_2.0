# Centichess

<img width="1780" height="938" alt="Screenshot 2025-07-13 142448" src="https://github.com/user-attachments/assets/cd72af80-f880-43cf-a9d0-17408f25480c" />

## Features

- **Interactive Chess Board**: Beautiful, responsive chessboard with multiple piece sets and themes
- **Advanced Analysis**: Powered by Lichess Cloud evaluation or multiple local Stockfish versions including Stockfish 17 Lite and NNUE
- **Detailed Game Reports**: Get comprehensive insights about your games including:
  - Move accuracy and classification (Perfect, Excellent, Good, Inaccuracy, Mistake, Blunder)
  - Game phase detection (Opening, Middlegame, Endgame)
  - Visual evaluation graph
  - Time management analysis
  - Game statistics and patterns
- **Customizable Interface**: Multiple board themes, piece sets, and UI customization options
- **Multiple Game Sources**: Support for:
  - Direct PGN import
  - Lichess game analysis
  - Manual game input
- **Fast & Efficient**: Client-side analysis means no server delays or queues
- **Fully Web-Based**: No installation required - works right in your browser
- **Responsive Design**: Works seamlessly on both desktop and mobile devices

## Live Demo

Try it live at: [centichess.org](centichess.org)

<img width="1390" height="942" alt="image" src="https://github.com/user-attachments/assets/cc44eb72-a0ee-4892-9d36-c8ff4a56caf5" />

## Technical Stack

- Pure JavaScript (ES6+)
- HTML5 Canvas for board element and arrow rendering
- Web Workers for background analysis
- Lichess Cloud evaluation API
- Multiple Stockfish versions (11, 16, 17) with NNUE support

## Development

<img width="1292" height="932" alt="image" src="https://github.com/user-attachments/assets/49b37f42-0091-4517-aef3-c6a86abe8da5" />


### Prerequisites

- Modern web browser
- Local web server (for development)

### Setup

1. Clone the repository:
```bash
git clone https://github.com/cooper-ross/centichess.git
```

2. Navigate to the project directory:
```bash
cd centichess
```

3. Serve the project using any local web server. For example, using Python:
```bash
# Python 3
python -m http.server 8000
```

4. Open `http://localhost:8000` in your browser

### Project Structure

```
centichess/
├── assets/            # Static assets (pieces, sounds, etc.)
├── libs/             # Third-party libraries
├── src/              # Source code
│   ├── classification/   # Game analysis algorithms
│   ├── components/      # UI components
│   ├── engines/        # Stockfish engine variants
│   ├── evaluation/     # Position evaluation logic
│   └── pages/         # Page-specific code
└── index.html        # Main entry point
```

<img width="1316" height="930" alt="image" src="https://github.com/user-attachments/assets/03a10ecb-7277-4f97-93e6-0493f2a4d30e" />

## Contributing

Contributions are welcome! Whether it's:
- Bug fixes
- New features
- Documentation improvements
- UI/UX enhancements

Please feel free to submit pull requests or open issues.

## Acknowledgments

- [Lichess](https://lichess.org/) - Cloud evaluation API for fast analysis
- [Stockfish](https://stockfishchess.org/) - The powerful chess engine that powers the analysis
- [chess.js](https://github.com/jhlywa/chess.js) - Chess logic implementation
