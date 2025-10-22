# Accuracy Calculation Implementation

This document describes the new Win% based accuracy calculation system that has been implemented in CentiChess.

## Overview

The accuracy calculation has been upgraded from a simple fixed-value system to a sophisticated Win% based methodology similar to Lichess/Chess.com. This provides a more nuanced and realistic representation of move and game quality.

## Key Changes

### 1. New AccuracyCalculator Module (`src/evaluation/AccuracyCalculator.js`)

A new utility class has been created with the following core functions:

#### Win% Calculation
Converts centipawn evaluation to win percentage:
```javascript
Win% = 50 + 50 * (2 / (1 + exp(-0.00368208 * centipawns)) - 1)
```

#### Move Accuracy Calculation
Calculates individual move accuracy based on Win% loss:
```javascript
Accuracy% = 103.1668 * exp(-0.04354 * (winPercentBefore - winPercentAfter)) - 3.1669
```

#### Game Accuracy Calculation
Uses a sophisticated algorithm that:
1. Creates sliding windows based on game length (window size: 2-8 moves)
2. Calculates volatility (standard deviation) for each window
3. Computes volatility-weighted mean of move accuracies
4. Computes harmonic mean of move accuracies
5. Returns the average of weighted mean and harmonic mean

This approach better handles:
- Games with one-move blunders in equal positions
- Completely dominated games
- Varying levels of position complexity

### 2. Updated MoveEvaluator (`src/evaluation/MoveEvaluator.js`)

**Changes:**
- Imported `AccuracyCalculator`
- Replaced simple average accuracy calculation with `AccuracyCalculator.calculateBothPlayerAccuracies(moves)`
- Updated phase accuracy calculations to use the new Win% system
- Results are converted from 0-100 range to 0-1 range for backward compatibility

**Code location:** Lines 301-308, 380-381

### 3. Updated MoveClassifier (`src/classification/MoveClassifier.js`)

**Changes:**
- Imported `AccuracyCalculator`
- Added dynamic accuracy calculation for each move via `move.dynamicAccuracy`
- Added accuracy calculation to all early return paths in `classifyMove()`
- Each move now has both:
  - `move.classification.accuracy` (fixed value from classification type)
  - `move.dynamicAccuracy` (calculated Win% based accuracy)

**Code locations:** Lines 5, 536-537, 554-555, 578-579, 589-590, 717-718, 769-773

## Benefits

### More Accurate Representation
- Moves are evaluated based on how much they decrease winning chances, not fixed thresholds
- Accounts for position complexity and game phase

### Better Game Accuracy
- Weighted by position volatility
- Not skewed by single blunders in otherwise good games
- More closely matches player expectations

### Individual Move Insights
- Each move has a precise accuracy percentage (0-100)
- Can display per-move accuracy in UI
- Better feedback for learning

## Data Structure

Each analyzed move now contains:
```javascript
{
  classification: Classification.PERFECT, // Classification object with fixed accuracy
  dynamicAccuracy: 98.5,                  // Calculated Win% based accuracy (0-100)
  lines: [...],                           // Engine evaluation lines
  fen: "...",                             // Position FEN
  // ... other properties
}
```

Game analysis returns:
```javascript
{
  white: {
    accuracy: 0.92,  // 0-1 range (92%)
    counts: {...},
    elo: 1850
  },
  black: {
    accuracy: 0.88,  // 0-1 range (88%)
    counts: {...},
    elo: 1750
  },
  phaseClassifications: {...},
  moves: [...]
}
```

## Compatibility

The implementation maintains backward compatibility:
- Game accuracy is still in 0-1 range (converted from 0-100)
- All existing code using `analysis.white.accuracy` continues to work
- UI display still shows percentages (multiplied by 100)
- Classification counts and phase classifications unchanged

## Testing

To verify the implementation:
1. Analyze a game with the new system
2. Check that accuracy values are reasonable (typically 70-99%)
3. Verify that blunders significantly reduce accuracy
4. Ensure brilliant moves in complex positions show high accuracy
5. Confirm phase classifications update based on accuracy

## Future Enhancements

Possible improvements:
- Display individual move accuracy in the move list
- Show accuracy graphs over time
- Compare move accuracy vs classification
- Provide accuracy-based training insights

