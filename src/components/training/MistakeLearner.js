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
        this.solvedCorrectly = 0; // Track mistakes solved without hints/solutions
        this.usedHintOrSolution = false; // Track if current mistake used help
        this.currentEvaluationId = null; // Track current evaluation to prevent race conditions
        this.lastIncorrectMove = null; // Store last incorrect move for "Try again" button
        this.lastPositionBeforeMistake = null; // Store position for undo
        this.mistakeSolved = false; // Track if current mistake was solved (top engine move made)
        this.positionBeforeLearning = null; // Store position before entering learning mode
        
        // Initialize audio for learning sounds with normalized volume
        this.sounds = {
            correct: new Audio('/assets/sounds/learning/correct.mp3'),
            wrong: new Audio('/assets/sounds/learning/wrong.mp3'),
            completed: new Audio('/assets/sounds/learning/completed.mp3'),
            better: new Audio('/assets/sounds/learning/better.mp3')
        };
        
        // Normalize volume for all learning sounds
        Object.values(this.sounds).forEach(sound => {
            sound.volume = 0.4; // Normalized volume level
        });
    }

    /**
     * Starts the learning mode
     */
    start() {
        if (!this.chessUI.analysis || !this.chessUI.analysis.moves) {
            this.showMessage('No analysis available. Please analyze a game first.');
            return;
        }

        // Save current position before entering learning mode
        this.positionBeforeLearning = this.chessUI.moveTree.currentNode.id;
        
        // Reset all state
        this.solvedCorrectly = 0;
        this.usedHintOrSolution = false;
        this.currentEvaluationId = null;
        this.lastIncorrectMove = null;
        this.lastPositionBeforeMistake = null;
        this.mistakeSolved = false;

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

        // Check if inaccuracies should be included (default: true)
        const includeInaccuracies = this.chessUI.settingsMenu.getSettingValue('includeInaccuraciesInLearning') !== false;

        this.chessUI.analysis.moves.forEach((move, index) => {
            // Check if this move is by the user
            const moveIsBlack = move.fen.includes(' w '); // After black's move, it's white's turn
            const isUserMove = (userIsBlack && moveIsBlack) || (!userIsBlack && !moveIsBlack);

            if (isUserMove && move.classification) {
                const classification = move.classification.type;
                // Filter based on setting - always include mistake and blunder
                if (classification === 'mistake' || classification === 'blunder' || 
                    (classification === 'inaccuracy' && includeInaccuracies)) {
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
        this.usedHintOrSolution = false; // Reset for new mistake
        this.mistakeSolved = false; // Reset for new mistake

        // Get the position BEFORE the mistake was made
        const mistakeMainlineIndex = this.currentMistakeMove.mainlineIndex;
        const positionBeforeMistake = this.chessUI.moveTree.mainline[mistakeMainlineIndex - 1];

        if (!positionBeforeMistake) {
            console.error('Could not find position before mistake');
            return;
        }

        // Track this position
        this.currentMistakeNodeId = positionBeforeMistake.id;

        // Navigate directly to position before mistake (no animation)
        this.chessUI.moveNavigator.handleTreeNodeClick(positionBeforeMistake);
        
        // Highlight opponent's last move squares (if exists)
        if (positionBeforeMistake.move) {
            const fromSquare = positionBeforeMistake.move.from;
            const toSquare = positionBeforeMistake.move.to;
            this.chessUI.board.highlightSquare(fromSquare, '#ffeb3b', 0.4);
            this.chessUI.board.highlightSquare(toSquare, '#ffeb3b', 0.4);
        }
        
        // Setup mistake position UI
        this.setupMistakePosition(mistakeMainlineIndex);
    }

    /**
     * Sets up the mistake position UI (arrows and feedback)
     */
    setupMistakePosition(mistakeMainlineIndex) {
        // Clear any arrows from normal mode
        this.chessUI.board.clearBestMoveArrows();
        this.chessUI.board.clearHighlights();

        // Re-highlight opponent's last move squares (if exists)
        const positionBeforeMistake = this.chessUI.moveTree.mainline[mistakeMainlineIndex - 1];
        if (positionBeforeMistake?.move) {
            const fromSquare = positionBeforeMistake.move.from;
            const toSquare = positionBeforeMistake.move.to;
            this.chessUI.board.highlightSquare(fromSquare, '#ffeb3b', 0.4);
            this.chessUI.board.highlightSquare(toSquare, '#ffeb3b', 0.4);
        }

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

        // Show initial learning actions with mistake message
        const classification = this.currentMistakeMove.classification;
        const moveNotation = mistakeMoveNode?.move?.san || 'the move';
        const classificationColor = this.getClassificationColor(classification);
        const message = `${moveNotation} was ${this.getArticle(classification)} <strong style="color: ${classificationColor}">${classification}</strong>. Find the best move!`;
        
        this.showInitialActions(message);
    }

    /**
     * Enables navigation buttons (hint, backward, forward)
     */
    enableNavigationButtons() {
        $('#hint, #backward, #forward').prop('disabled', false).css('opacity', '1');
    }

    /**
     * Disables navigation buttons (hint, backward, forward)
     */
    disableNavigationButtons() {
        $('#hint, #backward, #forward').prop('disabled', true).css('opacity', '0.5');
    }

    /**
     * Shows initial learning actions under the chessboard
     */
    showInitialActions(message) {
        const current = this.currentMistakeIndex + 1;
        const total = this.mistakeMoves.length;
        
        $('#learning-actions').html(`
            <div class="learning-actions-counter">Mistake ${current} of ${total}</div>
            ${message ? `<div class="learning-actions-message">${message}</div>` : ''}
            <div class="learning-actions-buttons">
                <button class="learning-action-btn" id="view-solution">View Solution</button>
                <button class="learning-action-btn" id="skip-mistake">Skip this move</button>
            </div>
        `).show();

        // Enable navigation buttons for initial state
        this.enableNavigationButtons();

        // Bind event handlers
        $('#view-solution').off('click').on('click', () => this.viewSolution());
        $('#skip-mistake').off('click').on('click', () => this.nextMistake());
    }


    /**
     * Shows "moved away" actions
     */
    showMovedAwayActions() {
        const current = this.currentMistakeIndex + 1;
        const total = this.mistakeMoves.length;
        
        $('#learning-actions').html(`
            <div class="learning-actions-counter">Mistake ${current} of ${total}</div>
            <div class="learning-actions-message">You moved away</div>
            <div class="learning-actions-buttons">
                <button class="learning-action-btn primary" id="resume-learning">Resume learning</button>
            </div>
        `).show();

        // Enable navigation buttons when moved away
        this.enableNavigationButtons();

        // Bind event handler
        $('#resume-learning').off('click').on('click', () => this.backToCurrentMistake());
    }

    /**
     * Shows correct move actions
     */
    showCorrectMoveActions(message = null) {
        const current = this.currentMistakeIndex + 1;
        const total = this.mistakeMoves.length;
        const isLast = current >= total;
        
        const defaultMessage = `<span style="font-weight: bold; color: var(--color-green-300);">Well done! That is the correct move.</span>`;
        
        $('#learning-actions').html(`
            <div class="learning-actions-counter">Mistake ${current} of ${total}</div>
            <div class="learning-actions-message">${message || defaultMessage}</div>
            <div class="learning-actions-buttons">
                <button class="learning-action-btn primary" id="next-solution">${isLast ? 'Complete Training' : 'Next Mistake'}</button>
            </div>
        `).show();

        // Disable navigation buttons when showing result
        this.disableNavigationButtons();

        // Bind event handler
        $('#next-solution').off('click').on('click', () => this.nextMistake());
    }

    /**
     * Shows alternative move actions (good/excellent but not best)
     */
    showAlternativeMoveActions(message) {
        const current = this.currentMistakeIndex + 1;
        const total = this.mistakeMoves.length;
        
        $('#learning-actions').html(`
            <div class="learning-actions-counter">Mistake ${current} of ${total}</div>
            <div class="learning-actions-message">${message}</div>
            <div class="learning-actions-buttons">
                <button class="learning-action-btn primary" id="try-again-action">Try again</button>
                <button class="learning-action-btn" id="next-anyway">Next anyway</button>
            </div>
        `).show();

        // Disable navigation buttons when showing result
        this.disableNavigationButtons();

        // Bind event handlers
        $('#try-again-action').off('click').on('click', () => {
            const mistakeMainlineIndex = this.currentMistakeMove.mainlineIndex;
            const positionBeforeMistake = this.chessUI.moveTree.mainline[mistakeMainlineIndex - 1];
            
            // Reset to mistake position (clear any alternative moves)
            this.chessUI.board.fen(positionBeforeMistake.fen || positionBeforeMistake.move?.after);
            
            // Clear any classification badges from the alternative move
            this.chessUI.board.clearClassificationBadges?.() || $('.classification-badge').remove();
            
            this.setupMistakePosition(mistakeMainlineIndex);
        });
        $('#next-anyway').off('click').on('click', () => this.nextMistake());
    }

    /**
     * Shows the solution by making the best move on the board
     */
    viewSolution() {
        // Mark that help was used
        this.usedHintOrSolution = true;

        const mistakeMainlineIndex = this.currentMistakeMove.mainlineIndex;
        const positionBeforeMistake = this.chessUI.moveTree.mainline[mistakeMainlineIndex - 1];
        
        const prevFen = positionBeforeMistake.fen || positionBeforeMistake.move?.after;
        const prevAnalysis = this.chessUI.analysis.moves.find(m => m.fen === prevFen);
        const bestLine = prevAnalysis?.lines?.find(l => l.id === 1);

        if (bestLine) {
            // Extract move details from UCI
            const from = bestLine.uciMove.substring(0, 2);
            const to = bestLine.uciMove.substring(2, 4);
            const promotion = bestLine.uciMove.length > 4 ? bestLine.uciMove.substring(4, 5) : undefined;

            // Make the move on the board
            const tempChess = new (this.chessUI.board.chess.constructor)();
            tempChess.load(prevFen);
            const moveObj = tempChess.move({ from, to, promotion });

            if (moveObj) {
                // Animate the solution move
                this.chessUI.board.move(moveObj, true, 'excellent', prevFen, false, promotion, false);
                
                // Mark as correct and show success
                this.correctMoveMade = true;
                this.hintLevel = 0;

                // Clear highlights and arrows
                this.chessUI.board.clearHighlights();
                this.chessUI.board.clearBestMoveArrows();

                // Show correct move actions with solution message
                this.showCorrectMoveActions(`<span style="font-weight: bold;">Here's the solution!</span>`);
            }
        }
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

        // Get the position before mistake
        const mistakeMainlineIndex = this.currentMistakeMove.mainlineIndex;
        const positionBeforeMistake = this.chessUI.moveTree.mainline[mistakeMainlineIndex - 1];
        const prevFen = positionBeforeMistake.fen || positionBeforeMistake.move?.after;
        
        // Check if this move is the top engine move (no need to evaluate)
        const prevAnalysis = this.chessUI.analysis.moves.find(m => m.fen === prevFen);
        const bestLine = prevAnalysis?.lines?.find(l => l.id === 1);

        if (bestLine) {
            // Build UCI move from user's move
            let userUciMove = moveObj.from + moveObj.to;
            if (moveObj.promotion) {
                userUciMove += moveObj.promotion;
            }
            
            // Compare with best move
            if (userUciMove === bestLine.uciMove) {
                // This is the top engine move! Handle immediately without evaluation
                const currentFen = this.chessUI.board.chess.fen();
                this.chessUI.board.move(moveObj, true, 'excellent', currentFen, false, moveObj.promotion, false);
                
                // Add classification to the board
                setTimeout(() => {
                    const fromIdx = this.chessUI.board.algebraicToIndex(moveObj.from, this.chessUI.board.flipped);
                    const toIdx = this.chessUI.board.algebraicToIndex(moveObj.to, this.chessUI.board.flipped);
                    this.chessUI.board.addClassification(
                        'excellent',
                        this.chessUI.board.getSquare(fromIdx, this.chessUI.board.flipped),
                        this.chessUI.board.getSquare(toIdx, this.chessUI.board.flipped)
                    );
                    
                    this.handleCorrectMove();
                }, 300);
                
                return false;
            }
        }
        
        // Not the top move - proceed with evaluation
        // Create temporary chess instance to get the resulting FEN
        const tempChess = new (this.chessUI.board.chess.constructor)();
        tempChess.load(prevFen);
        const moveResult = tempChess.move(moveObj);
        
        if (!moveResult) {
            // Invalid move - shouldn't happen but handle it
            this.handleIncorrectMove(positionBeforeMistake, null);
            return false;
        }

        const resultFen = tempChess.fen();
        
        // Animate the attempted move first (without classification initially)
        const currentFen = this.chessUI.board.chess.fen();
        this.chessUI.board.move(moveObj, true, undefined, currentFen, false, moveObj.promotion, false);
        
        // Show "evaluating" message in learning actions
        const current = this.currentMistakeIndex + 1;
        const total = this.mistakeMoves.length;
        $('#learning-actions').html(`
            <div class="learning-actions-counter">Mistake ${current} of ${total}</div>
            <div class="learning-actions-message">Evaluating move...</div>
        `).show();
        
        // Check if we already have analysis for this position
        const existingAnalysis = this.chessUI.analysis?.moves?.find(m => m.fen === resultFen);
        
        if (existingAnalysis?.classification) {
            // We already have the classification - show result after animation
            setTimeout(() => {
                // Add classification to the board
                const fromIdx = this.chessUI.board.algebraicToIndex(moveObj.from, this.chessUI.board.flipped);
                const toIdx = this.chessUI.board.algebraicToIndex(moveObj.to, this.chessUI.board.flipped);
                this.chessUI.board.addClassification(
                    existingAnalysis.classification.type,
                    this.chessUI.board.getSquare(fromIdx, this.chessUI.board.flipped),
                    this.chessUI.board.getSquare(toIdx, this.chessUI.board.flipped)
                );
                
                this.handleEvaluationResult({ classification: existingAnalysis.classification, move: moveResult }, positionBeforeMistake, moveResult, bestLine);
            }, 300);
        } else {
            // Queue evaluation
            setTimeout(() => {
                this.evaluateUserMove(moveObj, positionBeforeMistake, moveResult, resultFen, bestLine);
            }, 300);
        }

        return false; // Prevent default handling
    }

    /**
     * Evaluates a user's move to determine if it's an alternative solution
     */
    evaluateUserMove(moveObj, positionBeforeMistake, moveResult, resultFen, bestLine) {
        const prevFen = positionBeforeMistake.fen || positionBeforeMistake.move?.after;
        
        // Store evaluation state to prevent race conditions
        const evaluationId = 'learning_eval_' + Date.now();
        this.currentEvaluationId = evaluationId;
        
        // Set a timeout fallback in case evaluation gets stuck (10 seconds)
        const timeoutId = setTimeout(() => {
            // Only proceed if this evaluation is still current
            if (this.currentEvaluationId === evaluationId) {
                console.warn('Evaluation timeout - treating move as incorrect');
                this.handleIncorrectMove(positionBeforeMistake, moveResult);
                this.currentEvaluationId = null;
            }
        }, 10000); // 10 second timeout (increased from 5)
        
        // Queue evaluation
        this.chessUI.evaluationQueue.addToQueue(
            { id: evaluationId, move: moveResult },
            resultFen,
            prevFen,
            (evaluatedMove) => {
                // Only proceed if this evaluation is still current (prevent race conditions)
                if (this.currentEvaluationId !== evaluationId) {
                    clearTimeout(timeoutId);
                    return; // This evaluation is stale, ignore it
                }
                
                clearTimeout(timeoutId);
                this.currentEvaluationId = null;
                
                // Add classification to the board
                if (evaluatedMove.classification) {
                    const fromIdx = this.chessUI.board.algebraicToIndex(moveObj.from, this.chessUI.board.flipped);
                    const toIdx = this.chessUI.board.algebraicToIndex(moveObj.to, this.chessUI.board.flipped);
                    this.chessUI.board.addClassification(
                        evaluatedMove.classification.type,
                        this.chessUI.board.getSquare(fromIdx, this.chessUI.board.flipped),
                        this.chessUI.board.getSquare(toIdx, this.chessUI.board.flipped)
                    );
                }
                
                this.handleEvaluationResult(evaluatedMove, positionBeforeMistake, moveResult, bestLine);
            },
            this.chessUI.moveTree
        );
    }

    /**
     * Handles the evaluation result
     */
    handleEvaluationResult(evaluatedMove, positionBeforeMistake, moveResult, bestLine) {
        const classification = evaluatedMove.classification?.type;
        
        // Check if it's the best move (optimal classifications that only occur for top moves)
        const topOnlyMoves = ['perfect', 'best', 'brilliant', 'great', 'forced', 'book'];
        
        if (topOnlyMoves.includes(classification)) {
            // Best move found!
            this.handleCorrectMove();
        } else if (classification === 'excellent') {
            // Excellent can be either top move or alternative
            // Check if this is actually the top engine move by comparing UCI moves
            if (bestLine && moveResult) {
                // Build UCI move from the move result
                let moveUci = moveResult.from + moveResult.to;
                if (moveResult.promotion) {
                    moveUci += moveResult.promotion;
                }
                
                const isTopMove = moveUci === bestLine.uciMove;
                
                if (isTopMove) {
                    this.handleCorrectMove();
                } else {
                    this.handleAlternativeMove(classification, positionBeforeMistake);
                }
            } else {
                // Can't determine, treat as alternative
                this.handleAlternativeMove(classification, positionBeforeMistake);
            }
        } else if (classification === 'good') {
            // Alternative good move - show options
            this.handleAlternativeMove(classification, positionBeforeMistake);
        } else {
            // Not a good alternative (inaccuracy, mistake, blunder, etc.) - treat as incorrect
            this.handleIncorrectMove(positionBeforeMistake, moveResult, classification);
        }
    }

    /**
     * Handles when the correct (best) move is made
     */
    handleCorrectMove() {
            this.correctMoveMade = true;
            this.hintLevel = 0;

        // Track if solved without help
        if (!this.usedHintOrSolution) {
            this.solvedCorrectly++;
        }
        
        // Mark this mistake as solved (top engine move was made)
        this.mistakeSolved = true;

            // Clear highlights
            this.chessUI.board.clearHighlights();
            this.chessUI.board.clearBestMoveArrows();

        // Play correct sound
        this.playSound('correct');

        // Show correct move actions (with default "Well done!" message)
        this.showCorrectMoveActions();

            // Trigger confetti
            this.triggerConfetti();

            // Auto-advance to next mistake if enabled
            const autoAdvance = this.chessUI.settingsMenu.getSettingValue('autoAdvanceToNextMistake');
            if (autoAdvance !== false) { // Default to true if not set
                setTimeout(() => {
                    this.nextMistake();
                }, 1500); // Wait 1.5 seconds before advancing
            }
    }

    /**
     * Handles alternative good/excellent moves
     */
    handleAlternativeMove(classification, positionBeforeMistake) {
        // Play "better" sound for good/excellent moves (there's better)
        this.playSound('better');
        
        // Simple text without spans, all black
        const moveType = classification === 'excellent' ? 'Excellent' : 'Good';
        const message = `${moveType}, but there's better!`;

        // Show alternative move actions with message
        this.showAlternativeMoveActions(message);
    }

    /**
     * Handles incorrect moves
     */
    handleIncorrectMove(positionBeforeMistake, incorrectMove, classification = null) {
        // Play wrong sound
        this.playSound('wrong');
        
        // Store the incorrect move for the "Try again" button
        this.lastIncorrectMove = incorrectMove;
        this.lastPositionBeforeMistake = positionBeforeMistake;
        
        // Add classification badge to the board if we have it
        if (classification && incorrectMove) {
            const fromIdx = this.chessUI.board.algebraicToIndex(incorrectMove.from, this.chessUI.board.flipped);
            const toIdx = this.chessUI.board.algebraicToIndex(incorrectMove.to, this.chessUI.board.flipped);
            this.chessUI.board.addClassification(
                classification,
                this.chessUI.board.getSquare(fromIdx, this.chessUI.board.flipped),
                this.chessUI.board.getSquare(toIdx, this.chessUI.board.flipped)
            );
        }
        
        // Show "Not quite" feedback with "Try again" button
        const current = this.currentMistakeIndex + 1;
        const total = this.mistakeMoves.length;
        $('#learning-actions').html(`
            <div class="learning-actions-counter">Mistake ${current} of ${total}</div>
            <div class="learning-actions-message">
                <span style="display: inline-flex; align-items: center;">
                    <span style="font-weight: bold; color: var(--color-red-300);">Incorrect move. Try again!</span>
                </span>
            </div>
            <div class="learning-actions-buttons">
                <button class="learning-action-btn primary" id="try-again-incorrect">Retry</button>
                <button class="learning-action-btn" id="view-solution-incorrect">View Solution</button>
            </div>
        `).show();

        // Disable navigation buttons when showing result
        this.disableNavigationButtons();

        // Bind event handlers
        $('#try-again-incorrect').off('click').on('click', () => {
            // Undo the incorrect move
            if (this.lastIncorrectMove) {
                this.chessUI.board.unmove(true, this.lastIncorrectMove, this.lastPositionBeforeMistake.fen || this.lastPositionBeforeMistake.move?.after);
        } else {
                this.chessUI.board.fen(this.lastPositionBeforeMistake.fen || this.lastPositionBeforeMistake.move?.after);
            }
            
            // Clear any classification badges from the incorrect move
            this.chessUI.board.clearClassificationBadges?.() || $('.classification-badge').remove();
            
            // Restore initial actions after brief delay
            setTimeout(() => {
                const mistakeMainlineIndex = this.currentMistakeMove.mainlineIndex;
                const mistakeMoveNode = this.chessUI.moveTree.mainline[mistakeMainlineIndex];
            const classification = this.currentMistakeMove.classification;
            const moveNotation = mistakeMoveNode?.move?.san || 'the move';
            const classificationColor = this.getClassificationColor(classification);
                const message = `${moveNotation} was ${this.getArticle(classification)} <strong style="color: ${classificationColor}">${classification}</strong>. Find the best move!`;
                
                this.showInitialActions(message);
            }, 300);
        });
        
        $('#view-solution-incorrect').off('click').on('click', () => {
            // Undo first, then show solution
            if (this.lastIncorrectMove) {
                this.chessUI.board.unmove(false, this.lastIncorrectMove, this.lastPositionBeforeMistake.fen || this.lastPositionBeforeMistake.move?.after);
            } else {
                this.chessUI.board.fen(this.lastPositionBeforeMistake.fen || this.lastPositionBeforeMistake.move?.after);
            }
            
            setTimeout(() => {
                this.viewSolution();
            }, 100);
        });
    }

    /**
     * Shows a hint to the user
     */
    showHint() {
        if (!this.isActive || this.correctMoveMade) {
            return;
        }

        // Mark that help was used
        this.usedHintOrSolution = true;

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
            this.chessUI.board.highlightSquare(bestFrom, '#710099', 0.59);
            this.hintLevel = 1;
        } else if (this.hintLevel === 1) {
            // Second hint: Show the best move arrow
            this.chessUI.board.clearHighlights();
            this.chessUI.board.addBestMoveArrow(bestLine.uciMove, '#710099', 0.59);
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
            
            // Use setupMistakePosition to properly restore the UI
            setTimeout(() => {
                this.setupMistakePosition(this.currentMistakeMove.mainlineIndex);
            }, 100);
        }
    }

    /**
     * Moves to the next mistake
     */
    nextMistake() {
        if (!this.isActive) {
            return;
        }

        // Can always move to next mistake (removed the check for correctMoveMade)
        if (this.currentMistakeIndex < this.mistakeMoves.length - 1) {
            // Go to next mistake
            this.navigateToMistake(this.currentMistakeIndex + 1);
        } else {
            // At last mistake - show completion
            this.showCompletionMessage();
        }
    }

    /**
     * Shows completion message after all mistakes are learned
     */
    showCompletionMessage() {
        // Play completion sound
        this.playSound('completed');
        
        // Show completion actions with score
        const total = this.mistakeMoves.length;
        const solved = this.solvedCorrectly;
        const current = this.mistakeMoves.length;
        $('#learning-actions').html(`
            <div class="learning-actions-counter" style="opacity: 0">Mistake ${current} of ${total}</div>
            <div class="learning-actions-message">🎉 Congratulations!<br>You completed ${solved} out of ${total} mistake${total > 1 ? 's' : ''}</div>
            <div class="learning-actions-buttons">
                <button class="learning-action-btn primary" id="finish-learning">Return to Report</button>
            </div>
        `).show();

        // Disable navigation buttons on completion screen
        this.disableNavigationButtons();

        // Bind event handler
        $('#finish-learning').off('click').on('click', () => this.exit());
        
        // Big confetti for completion
        this.triggerCompletionConfetti();
    }

    /**
     * Exits learning mode
     */
    exit() {
        // Navigate back to position before learning mode
        if (this.positionBeforeLearning) {
            const savedNode = this.chessUI.moveTree.nodeMap.get(this.positionBeforeLearning);
            if (savedNode) {
                this.chessUI.moveNavigator.handleTreeNodeClick(savedNode);
            }
        }
        
        this.isActive = false;
        this.mistakeMoves = [];
        this.currentMistakeIndex = 0;
        this.hintLevel = 0;
        this.correctMoveMade = false;
        this.solvedCorrectly = 0;
        this.usedHintOrSolution = false;
        this.currentEvaluationId = null; // Cancel any pending evaluations
        this.lastIncorrectMove = null;
        this.lastPositionBeforeMistake = null;
        this.mistakeSolved = false;
        this.positionBeforeLearning = null;

        // Restore normal UI
        this.chessUI.moveNavigator.hideLearningControls();
        this.chessUI.board.clearHighlights();
        this.chessUI.board.clearBestMoveArrows();

        // Re-enable navigation buttons
        this.enableNavigationButtons();

        // Hide learning actions container and unbind all event handlers
        $('#learning-actions').hide().off().empty();

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
            'miss': '#ff7769',
            'inaccuracy': '#f7c631',
            'good': '#81b64c',
            'excellent': '#81b64c',
            'best': '#81b64c',
            'great': '#749bbf',
            'brilliant': '#26c2a3',
            'book': '#d5a47d',
            'forced': '#81b64c'
        };
        return colors[classificationType.toLowerCase()] || 'var(--text-primary)';
    }

    /**
     * Triggers confetti animation for correct moves (simplified)
     */
    triggerConfetti() {
        if (typeof confetti === 'undefined') return;

        // Check if confetti is enabled in settings
        const confettiEnabled = this.chessUI.settingsMenu.getSettingValue('enableConfetti') !== false;
        if (!confettiEnabled) return;

        const duration = 1000;
        const animationEnd = Date.now() + duration;
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 500 };

        const interval = setInterval(function() {
            const timeLeft = animationEnd - Date.now();

            if (timeLeft <= 0) {
                return clearInterval(interval);
            }

            const particleCount = 40 * (timeLeft / duration);

            confetti({
                ...defaults,
                particleCount,
                origin: { x: 0.5, y: 0.5 }
            });
        }, 150);
    }

    /**
     * Triggers big confetti animation for completion (3 distinct shots)
     */
    triggerCompletionConfetti() {
        if (typeof confetti === 'undefined') return;

        // Check if confetti is enabled in settings
        const confettiEnabled = this.chessUI.settingsMenu.getSettingValue('enableConfetti') !== false;
        if (!confettiEnabled) return;

        const fireConfetti = (origin) => {
            confetti({
                particleCount: 100,
                spread: 70,
                startVelocity: 50,
                origin: origin,
                zIndex: 500
            });
        };

        // First shot
        fireConfetti({ x: 0.5, y: 0.5 });

        // Second shot after 500ms
        setTimeout(() => {
            fireConfetti({ x: 0.3, y: 0.6 });
        }, 500);

         // Third shot after 1000ms
        setTimeout(() => {
            fireConfetti({ x: 0.7, y: 0.6 });
        }, 1000);
    }

    /**
     * Plays a learning mode sound
     */
    playSound(soundName) {
        if (this.sounds[soundName]) {
            // Reset the sound to allow rapid replays
            this.sounds[soundName].currentTime = 0;
            this.sounds[soundName].play().catch(err => {
                console.warn('Failed to play learning sound:', err);
            });
        }
    }
}

