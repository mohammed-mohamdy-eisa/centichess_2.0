/**
 * AccuracyCalculator - Implements sophisticated accuracy calculation based on Win% methodology
 * Similar to Lichess accuracy calculation system
 */
export class AccuracyCalculator {
    /**
     * Convert centipawn evaluation to Win percentage
     * Win% = 50 + 50 * (2 / (1 + exp(-0.00368208 * centipawns)) - 1)
     * @param {number} centipawns - The evaluation in centipawns
     * @returns {number} Win percentage (0-100)
     */
    static centipawnsToWinPercent(centipawns) {
        if (centipawns === null || centipawns === undefined) {
            return 50; // Equal position
        }
        
        // Handle mate scores
        if (Math.abs(centipawns) > 10000) {
            return centipawns > 0 ? 100 : 0;
        }
        
        // Apply the win percentage formula
        const winPercent = 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * centipawns)) - 1);
        return Math.max(0, Math.min(100, winPercent));
    }

    /**
     * Calculate move accuracy based on Win% before and after the move
     * Accuracy% = 103.1668 * exp(-0.04354 * (winPercentBefore - winPercentAfter)) - 3.1669
     * @param {number} winPercentBefore - Win% before the move
     * @param {number} winPercentAfter - Win% after the move
     * @returns {number} Move accuracy percentage (0-100)
     */
    static calculateMoveAccuracy(winPercentBefore, winPercentAfter) {
        const winPercentLoss = Math.max(0, winPercentBefore - winPercentAfter);
        const accuracy = 103.1668 * Math.exp(-0.04354 * winPercentLoss) - 3.1669;
        return Math.max(0, Math.min(100, accuracy));
    }

    /**
     * Calculate standard deviation of an array of numbers
     * @param {number[]} values - Array of numbers
     * @returns {number} Standard deviation
     */
    static standardDeviation(values) {
        if (!values || values.length === 0) return 0;
        
        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
        const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
        
        return Math.sqrt(variance);
    }

    /**
     * Calculate weighted mean
     * @param {Array<[number, number]>} weightedValues - Array of [value, weight] pairs
     * @returns {number|null} Weighted mean or null if no valid values
     */
    static weightedMean(weightedValues) {
        if (!weightedValues || weightedValues.length === 0) return null;
        
        let sumWeightedValues = 0;
        let sumWeights = 0;
        
        for (const [value, weight] of weightedValues) {
            sumWeightedValues += value * weight;
            sumWeights += weight;
        }
        
        return sumWeights > 0 ? sumWeightedValues / sumWeights : null;
    }

    /**
     * Calculate harmonic mean
     * @param {number[]} values - Array of numbers
     * @returns {number|null} Harmonic mean or null if no valid values
     */
    static harmonicMean(values) {
        if (!values || values.length === 0) return null;
        
        const validValues = values.filter(v => v > 0);
        if (validValues.length === 0) return null;
        
        const sumReciprocals = validValues.reduce((sum, val) => sum + (1 / val), 0);
        return validValues.length / sumReciprocals;
    }

    /**
     * Calculate game accuracy using sophisticated weighted and harmonic mean approach
     * @param {Array} moves - Array of move objects with evaluations
     * @param {string} color - 'white' or 'black'
     * @returns {number} Game accuracy percentage (0-100)
     */
    static calculateGameAccuracy(moves, color) {
        if (!moves || moves.length === 0) return 0;

        // Build evaluation sequence: we need eval before each move and after each move
        // For each move, we need the position BEFORE the move (from previous move or start)
        // and AFTER the move (from current move)
        
        const evaluationPairs = [];
        
        for (let i = 0; i < moves.length; i++) {
            const move = moves[i];
            const isWhiteMove = move.fen && move.fen.includes(' b ');
            const isBlackMove = move.fen && move.fen.includes(' w ');
            
            // Only process moves for the specified color
            if ((color === 'white' && !isWhiteMove) || (color === 'black' && !isBlackMove)) {
                continue;
            }
            
            // Get evaluation before this move
            let evalBefore;
            if (i === 0) {
                // Starting position (approximately equal)
                evalBefore = { score: 0, type: 'cp' };
            } else {
                // Get evaluation from previous move
                evalBefore = moves[i - 1].lines?.[0] || { score: 0, type: 'cp' };
            }
            
            // Get evaluation after this move
            const evalAfter = move.lines?.[0] || { score: 0, type: 'cp' };
            
            evaluationPairs.push({ before: evalBefore, after: evalAfter });
        }

        if (evaluationPairs.length === 0) return 0;

        // Convert evaluations to centipawns from the player's perspective
        const getCentipawns = (evaluation) => {
            if (!evaluation) return 0;
            if (evaluation.type === 'mate') {
                return evaluation.score > 0 ? 20000 : -20000;
            }
            return evaluation.score || 0;
        };

        // Build win percent sequence (before each move)
        const allWinPercents = evaluationPairs.map(pair => {
            let cp = getCentipawns(pair.before);
            // Flip perspective for black
            if (color === 'black') cp = -cp;
            return this.centipawnsToWinPercent(cp);
        });
        
        // Add the final position (after last move)
        const lastPair = evaluationPairs[evaluationPairs.length - 1];
        let cpAfterLast = getCentipawns(lastPair.after);
        if (color === 'black') cpAfterLast = -cpAfterLast;
        allWinPercents.push(this.centipawnsToWinPercent(cpAfterLast));

        // Determine window size based on game length (between 2 and 8)
        const windowSize = Math.max(2, Math.min(8, Math.floor(evaluationPairs.length / 10)));

        // Create sliding windows
        const windows = [];
        
        // Add initial windows (padding at the start)
        const initialWindowCount = Math.min(windowSize - 2, allWinPercents.length - 2);
        for (let i = 0; i < initialWindowCount; i++) {
            windows.push(allWinPercents.slice(0, windowSize));
        }
        
        // Add sliding windows
        for (let i = 0; i <= allWinPercents.length - windowSize; i++) {
            windows.push(allWinPercents.slice(i, i + windowSize));
        }

        // Calculate weights (standard deviation, clamped between 0.5 and 12)
        const weights = windows.map(window => {
            const stdDev = this.standardDeviation(window);
            return Math.max(0.5, Math.min(12, stdDev));
        });

        // Calculate weighted accuracies for each move
        const weightedAccuracies = [];
        
        for (let i = 0; i < evaluationPairs.length && i < weights.length; i++) {
            const winPercentBefore = allWinPercents[i];
            const winPercentAfter = allWinPercents[i + 1];
            const weight = weights[i];
            
            const moveAccuracy = this.calculateMoveAccuracy(winPercentBefore, winPercentAfter);
            weightedAccuracies.push([moveAccuracy, weight]);
        }

        if (weightedAccuracies.length === 0) return 0;

        // Calculate weighted mean
        const weightedMeanValue = this.weightedMean(weightedAccuracies);
        
        // Calculate harmonic mean
        const accuracyValues = weightedAccuracies.map(([acc, _]) => acc);
        const harmonicMeanValue = this.harmonicMean(accuracyValues);

        // Return the average of weighted mean and harmonic mean
        if (weightedMeanValue === null && harmonicMeanValue === null) return 0;
        if (weightedMeanValue === null) return harmonicMeanValue;
        if (harmonicMeanValue === null) return weightedMeanValue;
        
        return (weightedMeanValue + harmonicMeanValue) / 2;
    }

    /**
     * Calculate accuracies for both players
     * @param {Array} moves - Array of all moves with evaluations
     * @returns {Object} Object with white and black accuracies
     */
    static calculateBothPlayerAccuracies(moves) {
        return {
            white: this.calculateGameAccuracy(moves, 'white'),
            black: this.calculateGameAccuracy(moves, 'black')
        };
    }

    /**
     * Calculate individual move accuracy and attach it to the move object
     * This is useful for displaying accuracy per move in the UI
     * @param {Object} move - Move object with lines array
     * @param {Object} previousMove - Previous move object with lines array
     * @param {string} color - 'white' or 'black'
     * @returns {number} Move accuracy percentage
     */
    static getMoveAccuracy(move, previousMove, color) {
        if (!move || !move.lines || !previousMove || !previousMove.lines) {
            return 100; // No data, assume perfect
        }

        // Get the best line evaluations
        const previousEval = previousMove.lines[0];
        const currentEval = move.lines[0];

        if (!previousEval || !currentEval) {
            return 100; // No evaluation data, assume perfect
        }

        // Convert evaluations to centipawns
        const getCentipawns = (evaluation) => {
            if (!evaluation) return 0;
            if (evaluation.type === 'mate') {
                return evaluation.score > 0 ? 20000 : -20000;
            }
            return evaluation.score || 0;
        };

        let cpBefore = getCentipawns(previousEval);
        let cpAfter = getCentipawns(currentEval);

        // Flip perspective for black
        if (color === 'black') {
            cpBefore = -cpBefore;
            cpAfter = -cpAfter;
        }

        const winPercentBefore = this.centipawnsToWinPercent(cpBefore);
        const winPercentAfter = this.centipawnsToWinPercent(cpAfter);

        return this.calculateMoveAccuracy(winPercentBefore, winPercentAfter);
    }
}

