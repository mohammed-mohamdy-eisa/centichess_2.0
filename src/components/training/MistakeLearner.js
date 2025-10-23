import { MoveInformation } from '../moves/MoveInformation.js';

/**
 * Manages the "Learn from Mistakes" training mode
 */
export class MistakeLearner {
    constructor(chessUI) {
        this.chessUI = chessUI;
        this.mistakeMoves = [];
        this.currentMistakeIndex = 0;
        this.isActive = false;
        this.hintLevel = 0; // 0 = no hint, 1 = piece highlighted, 2 = arrow shown
        this.currentMistakeMove = null;
        this.correctMoveMade = false;
        this.currentMistakeNodeId = null; // Track the node we should be at
    }

    /**
     * Starts the learning mode
     */
    start() {
        if (!this.chessUI.analysis || !this.chessUI.analysis.moves) {
            this.showMessage('No analysis available. Please analyze a game first.');
            return;
        }

        // Get all user mistakes
        this.mistakeMoves = this.getMistakeMoves();

        if (this.mistakeMoves.length === 0) {
            this.showMessage('Great job! No mistakes to learn from.');
            return;
        }

        // Enter learning mode
        this.isActive = true;
        this.currentMistakeIndex = 0;
        this.hintLevel = 0;
        this.correctMoveMade = false;

        // Update UI
        this.chessUI.moveNavigator.showLearningControls();
        this.chessUI.board.setOption({ isInteractive: true });

        // Hide sidebar content (but keep bottom-content visible) and scroll to top
        $('.sidebar-header').hide();
        $('.tab-content').hide();
        window.scrollTo({ top: 0, behavior: 'smooth' });

        // Navigate to first mistake
        this.navigateToMistake(0);
    }

    /**
     * Filters and returns all user moves classified as inaccuracy, mistake, or blunder
     */
    getMistakeMoves() {
        const mistakes = [];
        const userIsBlack = this.chessUI.game.username.toLowerCase() === this.chessUI.game.black?.name?.toLowerCase();

        this.chessUI.analysis.moves.forEach((move, index) => {
            // Check if this move is by the user
            const moveIsBlack = move.fen.includes(' w '); // After black's move, it's white's turn
            const isUserMove = (userIsBlack && moveIsBlack) || (!userIsBlack && !moveIsBlack);

            if (isUserMove && move.classification) {
                const classification = move.classification.type;
                if (classification === 'inaccuracy' || classification === 'mistake' || classification === 'blunder') {
                    mistakes.push({
                        moveIndex: index,
                        move: move,
                        classification: classification,
                        mainlineIndex: index + 1 // mainline[0] is root, so move 0 is mainline[1]
                    });
                }
            }
        });

        return mistakes;
    }

    /**
     * Navigates to a specific mistake position
     */
    navigateToMistake(index) {
        if (index < 0 || index >= this.mistakeMoves.length) {
            return;
        }

        this.currentMistakeIndex = index;
        this.currentMistakeMove = this.mistakeMoves[index];
        this.hintLevel = 0;
        this.correctMoveMade = false;

        // Get the position BEFORE the mistake was made
        const mistakeMainlineIndex = this.currentMistakeMove.mainlineIndex;
        const positionBeforeMistake = this.chessUI.moveTree.mainline[mistakeMainlineIndex - 1];

        if (!positionBeforeMistake) {
            console.error('Could not find position before mistake');
            return;
        }

        // Track this position
        this.currentMistakeNodeId = positionBeforeMistake.id;

        // Navigate to that position
        this.chessUI.moveNavigator.handleTreeNodeClick(positionBeforeMistake);
        
        // Update button to show "Next" since we're at the mistake position
        this.updateNavigationButton();

        // Clear any arrows from normal mode
        this.chessUI.board.clearBestMoveArrows();
        this.chessUI.board.clearHighlights();

        // Show the mistake move that was made with a red arrow
        const mistakeMoveNode = this.chessUI.moveTree.mainline[mistakeMainlineIndex];
        if (mistakeMoveNode?.move?.from && mistakeMoveNode?.move?.to) {
            this.chessUI.board.addMoveArrow(
                mistakeMoveNode.move.from,
                mistakeMoveNode.move.to,
                '#d44242',
                0.6
            );
        }

        // Update move info box
        const classification = this.currentMistakeMove.classification;
        const moveNotation = mistakeMoveNode?.move?.san || 'the move';
        const classificationColor = this.getClassificationColor(classification);
        MoveInformation.showLearningFeedback(
            `${moveNotation} was ${this.getArticle(classification)} <strong style="color: ${classificationColor}">${classification}</strong>. Find the best move!`,
            null
        );
    }

    /**
     * Returns the appropriate article (a/an) for a word
     */
    getArticle(word) {
        const vowels = ['a', 'e', 'i', 'o', 'u'];
        return vowels.includes(word[0].toLowerCase()) ? 'an' : 'a';
    }

    /**
     * Handles user move during learning mode
     */
    handleUserMove(moveObj) {
        if (!this.isActive || this.correctMoveMade) {
            return false; // Not in learning mode or already correct
        }

        // Get the best move from the previous position
        const mistakeMainlineIndex = this.currentMistakeMove.mainlineIndex;
        const positionBeforeMistake = this.chessUI.moveTree.mainline[mistakeMainlineIndex - 1];
        
        const prevFen = positionBeforeMistake.fen || positionBeforeMistake.move?.after;
        const prevAnalysis = this.chessUI.analysis.moves.find(m => m.fen === prevFen);
        const bestLine = prevAnalysis?.lines?.find(l => l.id === 1);

        if (!bestLine) {
            console.error('Could not find best move');
            return false;
        }

        // Extract from/to from UCI move (e.g., "e2e4" -> from: "e2", to: "e4")
        const bestFrom = bestLine.uciMove.substring(0, 2);
        const bestTo = bestLine.uciMove.substring(2, 4);
        const bestPromotion = bestLine.uciMove.length > 4 ? bestLine.uciMove.substring(4, 5) : undefined;

        // Check if the user's move matches the best move
        const isCorrect = moveObj.from === bestFrom && 
                         moveObj.to === bestTo && 
                         moveObj.promotion === bestPromotion;

        if (isCorrect) {
            // Correct move!
            this.correctMoveMade = true;
            this.hintLevel = 0;

            // Clear highlights
            this.chessUI.board.clearHighlights();
            this.chessUI.board.clearBestMoveArrows();

            // Show success message with icon
            MoveInformation.showLearningFeedback(
                `<span style="display: inline-flex; align-items: center;">
                    <img src="/assets/classifications/excellent.svg" class="move-icon" style="width: 20px; height: 20px; margin-right: 6px;">
                    <span style="font-weight: bold; color: var(--color-green-300);">Well done! </span> <span>You found the best move!</span>
                </span>`,
                true
            );

            // Trigger confetti
            this.triggerConfetti();

            // Auto-advance to next mistake if enabled
            const autoAdvance = this.chessUI.settingsMenu.getSettingValue('autoAdvanceToNextMistake');
            if (autoAdvance !== false) { // Default to true if not set
                setTimeout(() => {
                    this.nextMistake();
                }, 1500); // Wait 1.5 seconds before advancing
            }

            return true; // Allow the move
        } else {
            // Incorrect move - undo it
            const classification = this.currentMistakeMove.classification;
            const mistakeMoveNode = this.chessUI.moveTree.mainline[this.currentMistakeMove.mainlineIndex];
            const moveNotation = mistakeMoveNode?.move?.san || 'the move';
            const classificationColor = this.getClassificationColor(classification);
            
            MoveInformation.showLearningFeedback(
                `<span style="display: inline-flex; align-items: center;">
                    <img src="/assets/classifications/blunder.svg" class="move-icon" style="width: auto; height: 20px; margin-right: 6px;">
                    <span  style="color: var(--color-red-300); font-weight: bold;">Not quite.</span> <span>Try again!</span>
                </span>`,
                false
            );

            // Undo the move visually
            setTimeout(() => {
                this.chessUI.board.fen(positionBeforeMistake.fen || positionBeforeMistake.move?.after);
            }, 500);

            return false; // Prevent the move from being added to tree
        }
    }

    /**
     * Shows a hint to the user
     */
    showHint() {
        if (!this.isActive || this.correctMoveMade) {
            return;
        }

        const mistakeMainlineIndex = this.currentMistakeMove.mainlineIndex;
        const positionBeforeMistake = this.chessUI.moveTree.mainline[mistakeMainlineIndex - 1];
        
        const prevFen = positionBeforeMistake.fen || positionBeforeMistake.move?.after;
        const prevAnalysis = this.chessUI.analysis.moves.find(m => m.fen === prevFen);
        const bestLine = prevAnalysis?.lines?.find(l => l.id === 1);

        if (!bestLine) {
            return;
        }

        const bestFrom = bestLine.uciMove.substring(0, 2);
        const bestTo = bestLine.uciMove.substring(2, 4);

        if (this.hintLevel === 0) {
            // First hint: Highlight the piece to move
            this.chessUI.board.clearHighlights();
            this.chessUI.board.highlightSquare(bestFrom, '#c636ff', 0.59);
            this.hintLevel = 1;
        } else if (this.hintLevel === 1) {
            // Second hint: Show the best move arrow
            this.chessUI.board.clearHighlights();
            this.chessUI.board.addBestMoveArrow(bestLine.uciMove, '#c636ff', 0.59);
            this.hintLevel = 2;
        }
        // No more hints after level 2
    }

    /**
     * Checks if currently at the mistake position
     */
    isAtMistakePosition() {
        return this.chessUI.moveTree.currentNode.id === this.currentMistakeNodeId;
    }

    /**
     * Updates the next/back button text based on current position
     */
    updateNavigationButton() {
        const isAtMistake = this.isAtMistakePosition();
        this.chessUI.moveNavigator.updateNextBackButton(isAtMistake);
    }

    /**
     * Goes back to the current mistake position
     */
    backToCurrentMistake() {
        if (!this.isActive || !this.currentMistakeNodeId) {
            return;
        }

        const mistakeNode = this.chessUI.moveTree.nodeMap.get(this.currentMistakeNodeId);
        if (mistakeNode) {
            this.chessUI.moveNavigator.handleTreeNodeClick(mistakeNode);
            
            // Reset hint level when returning to mistake
            this.hintLevel = 0;
            
            // Clear any hints/highlights
            this.chessUI.board.clearHighlights();
            this.chessUI.board.clearBestMoveArrows();
            
            // Re-show the mistake arrow
            const mistakeMainlineIndex = this.currentMistakeMove.mainlineIndex;
            const mistakeMoveNode = this.chessUI.moveTree.mainline[mistakeMainlineIndex];
            if (mistakeMoveNode?.move?.from && mistakeMoveNode?.move?.to) {
                this.chessUI.board.addMoveArrow(
                    mistakeMoveNode.move.from,
                    mistakeMoveNode.move.to,
                    '#d44242',
                    0.6
                );
            }
            
            // Restore the original feedback message
            const classification = this.currentMistakeMove.classification;
            const moveNotation = mistakeMoveNode?.move?.san || 'the move';
            const classificationColor = this.getClassificationColor(classification);
            MoveInformation.showLearningFeedback(
                `${moveNotation} was ${this.getArticle(classification)} <strong style="color: ${classificationColor}">${classification}</strong>. Find the best move!`,
                null
            );
            
            this.updateNavigationButton();
        }
    }

    /**
     * Moves to the next mistake
     */
    nextMistake() {
        if (!this.isActive) {
            return;
        }

        // If at the mistake position but haven't made the correct move yet
        if (this.isAtMistakePosition() && !this.correctMoveMade) {
            this.showMessage('Find the correct move first!');
            return;
        }

        // If not at mistake position (showing "Back" button), shouldn't reach here
        // as the handler should call backToCurrentMistake instead
        if (!this.correctMoveMade) {
            return;
        }

        if (this.currentMistakeIndex < this.mistakeMoves.length - 1) {
            // Go to next mistake
            this.navigateToMistake(this.currentMistakeIndex + 1);
        } else {
            // Completed all mistakes!
            this.showCompletionMessage();
        }
    }

    /**
     * Shows completion message after all mistakes are learned
     */
    showCompletionMessage() {
        MoveInformation.showLearningFeedback(
            `🎉 Congratulations! You've learned from all ${this.mistakeMoves.length} mistake${this.mistakeMoves.length > 1 ? 's' : ''}.`,
            null
        );
        // Keep next button visible but disabled since we're done
        this.chessUI.moveNavigator.updateNextBackButton(true);
        
        // Big confetti for completion
        this.triggerCompletionConfetti();
    }

    /**
     * Exits learning mode
     */
    exit() {
        this.isActive = false;
        this.mistakeMoves = [];
        this.currentMistakeIndex = 0;
        this.hintLevel = 0;
        this.correctMoveMade = false;

        // Restore normal UI
        this.chessUI.moveNavigator.hideLearningControls();
        this.chessUI.board.clearHighlights();
        this.chessUI.board.clearBestMoveArrows();

        // Show sidebar content again
        $('.sidebar-header').show();
        $('.tab-content').show();

        // Restore normal move information
        const currentNode = this.chessUI.moveTree.currentNode;
        const prevNode = this.chessUI.moveTree.getPreviousMove();
        MoveInformation.updateMoveInfo(currentNode, prevNode);

        // Update arrows based on settings
        this.chessUI.moveNavigator.updateBoardArrows(currentNode);

        // Re-render the graph
        setTimeout(async () => {
            try {
                const { GameGraph } = await import('../report/GameGraph.js');
                if (GameGraph && typeof GameGraph.render === 'function') {
                    GameGraph.render();
                }
            } catch (e) {
                console.warn('Could not re-render graph:', e);
            }
        }, 100);
    }

    /**
     * Shows a message to the user
     */
    showMessage(message) {
        this.chessUI.moveNavigator.showNotification(message);
    }

    /**
     * Gets the color for a classification type
     */
    getClassificationColor(classificationType) {
        const colors = {
            'blunder': '#fa412d',
            'mistake': '#ffa459',
            'inaccuracy': '#f7c631',
            'good': '#81b64c',
            'excellent': '#81b64c',
            'perfect': '#81b64c',
            'great': '#749bbf',
            'brilliant': '#26c2a3',
            'theory': '#d5a47d',
            'forced': '#81b64c'
        };
        return colors[classificationType.toLowerCase()] || 'var(--text-primary)';
    }

    /**
     * Triggers confetti animation for correct moves
     */
    triggerConfetti() {
        if (typeof confetti === 'undefined') return;

        const duration = 1500;
        const animationEnd = Date.now() + duration;
        const defaults = { startVelocity: 35, spread: 360, ticks: 80, zIndex: 10000 };

        function randomInRange(min, max) {
            return Math.random() * (max - min) + min;
        }

        const interval = setInterval(function() {
            const timeLeft = animationEnd - Date.now();

            if (timeLeft <= 0) {
                return clearInterval(interval);
            }

            const particleCount = 100 * (timeLeft / duration);

            confetti({
                ...defaults,
                particleCount,
                origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }
            });
            confetti({
                ...defaults,
                particleCount,
                origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }
            });
        }, 150);
    }

    /**
     * Triggers big confetti animation for completion
     */
    triggerCompletionConfetti() {
        if (typeof confetti === 'undefined') return;

        const duration = 3000;
        const animationEnd = Date.now() + duration;
        const defaults = { startVelocity: 45, spread: 360, ticks: 100, zIndex: 10000 };

        function randomInRange(min, max) {
            return Math.random() * (max - min) + min;
        }

        const interval = setInterval(function() {
            const timeLeft = animationEnd - Date.now();

            if (timeLeft <= 0) {
                return clearInterval(interval);
            }

            const particleCount = 150 * (timeLeft / duration);

            confetti({
                ...defaults,
                particleCount,
                origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }
            });
            confetti({
                ...defaults,
                particleCount,
                origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }
            });
        }, 150);
    }
}

