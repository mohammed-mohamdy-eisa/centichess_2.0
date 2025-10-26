import { MoveInformation } from './MoveInformation.js';
import { EvaluationBar } from '../board/EvaluationBar.js';
import { EngineLines } from './EngineLines.js';
import { GameGraph } from '../report/GameGraph.js';
import { Clock } from '../board/Clock.js';

export class MoveNavigator {
    constructor(chessUI) {
        this.chessUI = chessUI;
        this.badMoveNode = null; // Stores the bad move node for "go back" functionality
        this.continuationComplete = false; // Tracks if best continuation sequence is complete
        this.continuationInProgress = false; // Tracks if continuation is currently executing
    }

    /**
     * Sets up event handlers for navigation buttons
     */
    setupEventHandlers() {
        $("#forward").on("click", () => this.handleForwardMove());
        $("#backward").on("click", () => this.handleBackwardMove());
        $("#flip").on("click", () => this.handleFlipBoard());
        $("#restart").on("click", () => this.handleRestart());
        $("#skip-to-end").on("click", () => this.handleSkipToEnd());
        $("#fen-to-clipboard").on("click", () => this.handleCopyFenToClipboard());

        // Quick menu handlers
        $("#popup-quick-menu").on("click", (e) => this.handleQuickMenuToggle(e));
        $("#share-fen").on("click", () => this.handleShareFen());
        $("#copy-pgn").on("click", () => this.handleCopyPgn());
        $("#flip-board").on("click", () => this.handleFlipBoard());
        $("#download-pgn").on("click", () => this.handleDownloadPgn());
        $("#show-best").on("click", () => this.handleShowBest());
        $("#show-best-btn").on("click", () => this.handleShowBest());
        
        // Learning settings toggle handlers
        $("#toggle-auto-advance").on("click", () => this.handleToggleLearningSettings('autoAdvanceToNextMistake'));
        $("#toggle-include-inaccuracies").on("click", () => this.handleToggleLearningSettings('includeInaccuraciesInLearning'));
        $("#toggle-confetti").on("click", () => this.handleToggleLearningSettings('enableConfetti'));

        // Close quick menu when clicking outside
        $(document).on("click", (e) => this.handleDocumentClick(e));

        // Keyboard navigation
        $(document).on('keydown', (e) => {
            switch (e.keyCode) {
                case 39: $("#forward").trigger('click'); break; // Right arrow
                case 37: $("#backward").trigger('click'); break; // Left arrow
                case 38: $("#restart").trigger('click'); break;  // Up arrow
                case 70: $("#flip").trigger('click'); break;  // F
            }
        });

        // Scroll wheel navigation
        $("#chessboard").on('wheel', (e) => {
            // Determine scroll direction
            const delta = e.originalEvent.deltaY;
            
            if (delta > 0) {
                // Scrolling down - move forward
                this.handleForwardMove();
            } else if (delta < 0) {
                // Scrolling up - move backward
                this.handleBackwardMove();
            }
        });

        // Set up new chessboard event listeners
        this.chessUI.board.on('usermove', (moveObj) => this.handleUserMove(moveObj));

        // Learning mode event handlers
        $("#hint").on("click", () => this.handleHint());
        $("#leave-learning").on("click", () => this.handleLeaveLearning());
    }

    handleCopyFenToClipboard() {
        const currentNode = this.chessUI.moveTree.currentNode;
        const fen = currentNode.move.after;
        navigator.clipboard.writeText(fen);
    }

    updateAfterMove(node) {
        this.chessUI.moveTree.updateCurrentMove(node.id);

        if (node.evalScore !== undefined) {
            EvaluationBar.updateEvaluationBar(node);
        }

        MoveInformation.updateMoveInfo(node, this.chessUI.moveTree.getPreviousMove());

        EngineLines.updateEngineLines(
            node, 
            this.chessUI.moveTree, 
            (node) => this.handleTreeNodeClick(node), 
            (node, resultFen, prevFen) => this.queueMoveForEvaluation(node, resultFen, prevFen)
        );

        GameGraph.updateCurrentMoveNumber(node.moveNumber);
        
        // Update clocks
        Clock.updateFromMoveTree(this.chessUI.moveTree, this.chessUI.board.flipped, this.chessUI.game?.pgn);

        // Clear any active hint arrow timeout
        if (this.hintArrowTimeout) {
            clearTimeout(this.hintArrowTimeout);
            this.hintArrowTimeout = null;
        }

        // Update board arrows per mode
        this.updateBoardArrows(node);
        
        // Update show-best button state based on evaluation availability
        this.updateShowBestButtonState(node);
        
        // Update show-best button visibility based on move classification
        this.updateShowBestButtonVisibility(node);
    }

    /**
     * Updates the best move arrow on the chessboard for the current position
     * @param {Object} node - The current move tree node
     */
    updateBoardArrows(node) {
        if (!this.chessUI.analysis || !this.chessUI.analysis.moves) return;

        const mode = this.chessUI.settingsMenu.getSettingValue('bestMoveArrowsMode') || 'best-response';

        // Always start by clearing arrows
        this.chessUI.board.clearBestMoveArrows();

        // If mode is 'none', don't show any arrows
        if (mode === 'none') return;

        // Helper function to check if a move classification is optimal
        const isOptimalMove = (classification) => {
            if (!classification) return false;
            const optimal = ['brilliant', 'great', 'best', 'theory', 'excellent'];
            return optimal.includes(classification.toLowerCase());
        };

        // Helper function to determine if current position is player's turn
        const isPlayerTurn = () => {
            if (!this.chessUI.game?.username) return false;
            const userIsBlack = this.chessUI.game.username.toLowerCase() === this.chessUI.game.black?.name?.toLowerCase();
            const prevNode = this.chessUI.moveTree.getPreviousMove();
            if (!prevNode?.move) return false;
            
            // If the previous move was made by white, current turn is black
            const currentTurnIsBlack = prevNode.move.color === 'w';
            return userIsBlack === currentTurnIsBlack;
        };

        if (mode === 'best-response') {
            // Best response mode - no changes
            const currentFen = node.fen;
            const currentAnalysis = this.chessUI.analysis.moves.find(m => m.fen === currentFen);
            const bestLine = currentAnalysis?.lines?.find(l => l.id === 1);
            if (bestLine?.uciMove) {
                this.chessUI.board.setBestMoveArrow(bestLine.uciMove);
            }
        } else if (mode === 'top-alternative') {
            // Top engine move mode
            const prevNode = this.chessUI.moveTree.getPreviousMove();
            if (prevNode && !isOptimalMove(node.classification)) {
                const prevFen = prevNode.fen || prevNode.move?.before;
                const prevAnalysis = this.chessUI.analysis.moves.find(m => m.fen === prevFen);
                const prevBest = prevAnalysis?.lines?.find(l => l.id === 1);
                if (prevBest?.uciMove) {
                    this.chessUI.board.addBestMoveArrow(prevBest.uciMove, null, 0.85);
                }
            }
        } else if (mode === 'both') {
            // Smart "Both" mode
            const playersTurn = isPlayerTurn();
            
            if (playersTurn) {
                // On player's turn
                const prevNode = this.chessUI.moveTree.getPreviousMove();
                
                if (isOptimalMove(node.classification)) {
                    // Optimal move: Only show best-response arrow
                    const currentFen = node.fen;
                    const currentAnalysis = this.chessUI.analysis.moves.find(m => m.fen === currentFen);
                    const bestLine = currentAnalysis?.lines?.find(l => l.id === 1);
                    if (bestLine?.uciMove) {
                        this.chessUI.board.setBestMoveArrow(bestLine.uciMove);
                    }
                } else {
                    // Suboptimal move: Show both arrows
                    // Best response arrow
                    const currentFen = node.fen;
                    const currentAnalysis = this.chessUI.analysis.moves.find(m => m.fen === currentFen);
                    const bestLine = currentAnalysis?.lines?.find(l => l.id === 1);
                    if (bestLine?.uciMove) {
                        this.chessUI.board.setBestMoveArrow(bestLine.uciMove);
                    }
                    
                    // Top alternative arrow
                    if (prevNode) {
                        const prevFen = prevNode.fen || prevNode.move?.before;
                        const prevAnalysis = this.chessUI.analysis.moves.find(m => m.fen === prevFen);
                        const prevBest = prevAnalysis?.lines?.find(l => l.id === 1);
                        if (prevBest?.uciMove) {
                            this.chessUI.board.addBestMoveArrow(prevBest.uciMove, null, 0.85);
                        }
                    }
                }
            } else {
                // On opponent's turn: Only show best move if they played a suboptimal move
                if (!isOptimalMove(node.classification)) {
                    const prevNode = this.chessUI.moveTree.getPreviousMove();
                    if (prevNode) {
                        const prevFen = prevNode.fen || prevNode.move?.before;
                        const prevAnalysis = this.chessUI.analysis.moves.find(m => m.fen === prevFen);
                        const prevBest = prevAnalysis?.lines?.find(l => l.id === 1);
                        if (prevBest?.uciMove) {
                            // Use red color for opponent's arrows
                            this.chessUI.board.addBestMoveArrow(prevBest.uciMove, 'rgba(231, 76, 60, 0.59)', 0.85);
                        }
                    }
                }
            }
        }
    }

    handleForwardMove() {
        const nextNode = this.chessUI.moveTree.getNextMove();
        if (!nextNode || !nextNode.move) return;

        // In learning mode, don't show classifications on the board
        const classification = this.chessUI.mistakeLearner?.isActive ? undefined : nextNode.classification;
        this.chessUI.board.move(nextNode.move, true, classification, nextNode.move.before, false, nextNode.move.promotion, false);

        this.chessUI.moveTree.navigateTo(nextNode.id);
        this.updateAfterMove(nextNode);
        
        // Update learning mode navigation if active
        if (this.chessUI.mistakeLearner?.isActive) {
            // Check if moved away from mistake position
            // Don't show "moved away" if mistake was already solved
            if (!this.chessUI.mistakeLearner.isAtMistakePosition() && !this.chessUI.mistakeLearner.mistakeSolved) {
                this.chessUI.mistakeLearner.showMovedAwayActions();
            }
        }
    }

    handleBackwardMove() {
        if (this.chessUI.moveTree.currentNode === this.chessUI.moveTree.mainline[0]) return;

        const currentNode = this.chessUI.moveTree.currentNode;
        const prevNode = this.chessUI.moveTree.getPreviousMove();

        if (!prevNode || !currentNode.move) return;

        this.chessUI.board.unmove(true, currentNode.move, currentNode.move.before);
        
        this.chessUI.moveTree.navigateTo(prevNode.id);
        this.chessUI.moveTree.updateNodeClassification(prevNode, this.chessUI.board);

        this.updateAfterMove(prevNode);
        
        // Update learning mode navigation if active
        if (this.chessUI.mistakeLearner?.isActive) {
            // Check if moved away from mistake position
            // Don't show "moved away" if mistake was already solved
            if (!this.chessUI.mistakeLearner.isAtMistakePosition() && !this.chessUI.mistakeLearner.mistakeSolved) {
                this.chessUI.mistakeLearner.showMovedAwayActions();
            }
        }
    }

    handleFlipBoard() {
        this.chessUI.board.flip();

        // Toggle the flipped class on the progress bar
        $(".eval-bar").toggleClass("flipped");
        $(".chess-container").toggleClass("flipped");

        const currentNode = this.chessUI.moveTree.currentNode;
        this.chessUI.moveTree.updateNodeClassification(currentNode, this.chessUI.board);
        
        if (currentNode.evalScore !== undefined) {
            EvaluationBar.updateEvaluationBar(currentNode);
        }
        
        // Update clocks after flipping
        Clock.updateFromMoveTree(this.chessUI.moveTree, this.chessUI.board.flipped, this.chessUI.game?.pgn);
    }

    handleRestart() {
        this.chessUI.board.fen();

        this.chessUI.moveTree.navigateTo('root');
        this.chessUI.moveTree.updateCurrentMove('root');

        GameGraph.updateCurrentMoveNumber(0);
        EvaluationBar.updateEvaluationBar();
        EngineLines.updateEngineLines(
            this.chessUI.moveTree.currentNode, 
            this.chessUI.moveTree, 
            (node) => this.handleTreeNodeClick(node), 
            (node, resultFen, prevFen) => this.queueMoveForEvaluation(node, resultFen, prevFen)
        );
        
        // Update clocks for starting position
        Clock.updateFromMoveTree(this.chessUI.moveTree, this.chessUI.board.flipped, this.chessUI.game?.pgn);
        
        // Update move info and board arrows
        MoveInformation.updateMoveInfo(this.chessUI.moveTree.currentNode, null);
        this.updateBoardArrows(this.chessUI.moveTree.currentNode);
    }

    handleSkipToEnd() {
        const lastMove = this.chessUI.moveTree.getFinalMove();
        this.handleTreeNodeClick(lastMove);
    }

    handleUserMove(moveObj) {
        // If in learning mode, delegate to MistakeLearner
        if (this.chessUI.mistakeLearner?.isActive) {
            return this.chessUI.mistakeLearner.handleUserMove(moveObj);
        }

        // Check if the move exists in the mainline next
        const currentIndex = this.chessUI.moveTree.getNodeIndex(this.chessUI.moveTree.currentNode);
        if (currentIndex !== -1 && currentIndex + 1 < this.chessUI.moveTree.mainline.length) {
            const nextMainlineMove = this.chessUI.moveTree.mainline[currentIndex + 1];
            if (nextMainlineMove.move && 
                nextMainlineMove.move.from === moveObj.from && 
                nextMainlineMove.move.to === moveObj.to && 
                nextMainlineMove.move.promotion === moveObj.promotion) {
                return this.navigateToExistingMove(nextMainlineMove);
            }
        }

        // Check if the move already exists as a variation
        const existingChild = this.chessUI.moveTree.currentNode.children.find(child =>
            child.move && child.move.from === moveObj.from &&
            child.move.to === moveObj.to &&
            child.move.promotion === moveObj.promotion
        );

        return existingChild ?
            this.navigateToExistingMove(existingChild) :
            this.createNewVariation(moveObj);
    }

    handleTreeNodeClick(node) {
        // Reset continuation state when manually navigating (unless navigating back via goBackToBadMove)
        if (!this._isGoingBackToBadMove) {
            this.badMoveNode = null;
            this.continuationComplete = false;
            this.continuationInProgress = false;
        }
        this._isGoingBackToBadMove = false;
        
        // Handle path navigation
        const path = this.chessUI.moveTree.getPathToNode(node.id);

        if (path.length > 0) {
            const lastNode = path[path.length - 1];

            // Already at this node - do nothing
            if (lastNode.id === this.chessUI.moveTree.currentNode.id) {
                return;
            }

            // Check if one move ahead
            if (this.chessUI.moveTree.currentNode.children.some(child => child.id === lastNode.id)) {
                const nextNode = this.chessUI.moveTree.getNextMove();
                if (nextNode && nextNode.id === lastNode.id) {
                    $("#forward").trigger('click');
                    return;
                }
            }

            // Check if one move behind (parent)
            const currentIndex = this.chessUI.moveTree.getNodeIndex(this.chessUI.moveTree.currentNode);
            const lastNodeIndex = this.chessUI.moveTree.getNodeIndex(lastNode);
            if (currentIndex > 0 && lastNodeIndex === currentIndex - 1) {
                $("#backward").trigger('click');
                return;
            }
            
            // Check if parent of variation
            if (this.chessUI.moveTree.currentNode.parentId === lastNode.id) {
                $("#backward").trigger('click');
                return;
            }
        }

        // For moves more than one step away
        const targetNode = this.chessUI.moveTree.nodeMap.get(node.id);

        //console.log(targetNode.evaluatedMove?.comment)

        // Handle root node case
        if (!targetNode || targetNode.id === 'root') {
            this.handleRestart();
            return;
        }

        // Handle multi-step navigation
        this.navigateToTargetPosition(targetNode);
    }

    navigateToExistingMove(moveNode) {
        this.chessUI.moveTree.navigateTo(moveNode.id);

        // Add classification to the board (skip in learning mode)
        if (!this.chessUI.mistakeLearner?.isActive) {
        const fromIdx = this.chessUI.board.algebraicToIndex(moveNode.move.from, this.chessUI.board.flipped);
        const toIdx = this.chessUI.board.algebraicToIndex(moveNode.move.to, this.chessUI.board.flipped);
        this.chessUI.board.addClassification(
            moveNode.classification,
            this.chessUI.board.getSquare(fromIdx, this.chessUI.board.flipped),
            this.chessUI.board.getSquare(toIdx, this.chessUI.board.flipped)
        );
        }

        this.updateAfterMove(moveNode);

        return true;
    }

    navigateToTargetPosition(targetNode) {
        let parentNode;
        
        // Find the parent node based on whether the target is in mainline or a variation
        const targetNodeIndex = this.chessUI.moveTree.getNodeIndex(targetNode);
        if (targetNodeIndex !== -1) {
            // Target is in mainline
            parentNode = this.chessUI.moveTree.mainline[targetNodeIndex - 1];
        } else if (targetNode.parentId) {
            // Target is a variation
            parentNode = this.chessUI.moveTree.nodeMap.get(targetNode.parentId);
        } else {
            console.error("Cannot find parent for node", targetNode);
            return;
        }
        
        this.chessUI.board.fen(targetNode.move.before);
        if (targetNode.move) {
            // In learning mode, don't show classifications on the board
            const classification = this.chessUI.mistakeLearner?.isActive ? undefined : targetNode.classification;
            this.chessUI.board.move(targetNode.move, true, classification, targetNode.move.before, false, targetNode.move.promotion);
        }

        // Update move tree and UI
        this.chessUI.moveTree.navigateTo(targetNode.id);
        this.updateAfterMove(targetNode);
    }

    createNewVariation(moveObj) {
        // Add the move to the tree
        const newNode = this.chessUI.moveTree.addMove(moveObj, this.chessUI.moveTree.currentNode.id);
        newNode.evaluationStatus = 'pending';

        this.chessUI.moveTree.navigateTo(newNode.id);
        this.chessUI.moveTree.render('move-tree', (node) => this.handleTreeNodeClick(node));
        this.updateAfterMove(newNode);

        // Queue for evaluation
        const fenBefore = newNode.move.before;
        const fenAfter = newNode.move.after;
        this.queueMoveForEvaluation(newNode, fenAfter, fenBefore);

        return true;
    }

    queueMoveForEvaluation(node, resultFen, prevFen) {
        this.chessUI.evaluationQueue.addToQueue(node, resultFen, prevFen, (evaluatedMove) => {
            // Update classification and evaluation data
            this.chessUI.moveTree.updateClassification(node.id, evaluatedMove);
            node.evaluationStatus = 'complete';

            const topLine = evaluatedMove.lines.find(line => line.id === 1);
            if (topLine) {
                node.evalScore = topLine.score;
                node.evalType = topLine.type || 'cp';
            }

            // Update UI if this is the current node
            const currentNode = this.chessUI.moveTree.currentNode;
            if (currentNode.id === node.id && node.move) {
                const fromIdx = this.chessUI.board.algebraicToIndex(node.move.from, this.chessUI.board.flipped);
                const toIdx = this.chessUI.board.algebraicToIndex(node.move.to, this.chessUI.board.flipped);

                this.chessUI.board.addClassification(
                    evaluatedMove.classification.type,
                    this.chessUI.board.getSquare(fromIdx, this.chessUI.board.flipped),
                    this.chessUI.board.getSquare(toIdx, this.chessUI.board.flipped)
                );
            }

            this.chessUI.moveTree.render('move-tree', (node) => this.handleTreeNodeClick(node));
            this.updateAfterMove(currentNode);
            
            // Update show-best button state for the evaluated node if it's current
            if (currentNode.id === node.id) {
                this.updateShowBestButtonState(currentNode);
            }

        }, this.chessUI.moveTree);
    }

    handleQuickMenuToggle(e) {
        e.stopPropagation();
        const menu = $("#quick-menu");
        const isVisible = menu.hasClass('show');
        
        if (isVisible) {
            menu.removeClass('show');
        } else {
            menu.addClass('show');
        }
    }

    handleDocumentClick(e) {
        const menu = $("#quick-menu");
        const button = $("#play");
        
        if (!menu.is(e.target) && menu.has(e.target).length === 0 && 
            !button.is(e.target) && button.has(e.target).length === 0) {
            menu.removeClass('show');
        }
    }

    handleShareFen() {
        const currentNode = this.chessUI.moveTree.currentNode;
        const fen = currentNode.move ? currentNode.move.after : currentNode.fen;
        
        if (navigator.share) {
            navigator.share({
                title: 'Chess Position',
                text: `Check out this chess position: ${fen}`,
                url: window.location.href
            }).catch(console.error);
        } else {
            // Fallback to clipboard
            navigator.clipboard.writeText(fen).then(() => {
                this.showNotification('FEN copied to clipboard!');
            }).catch(() => {
                this.showNotification('Failed to copy FEN');
            });
        }
        $("#quick-menu").removeClass('show');
    }

    handleCopyPgn() {
        const pgn = this.chessUI.game?.pgn || '';
        if (pgn) {
            navigator.clipboard.writeText(pgn).then(() => {
                this.showNotification('PGN copied to clipboard!');
            }).catch(() => {
                this.showNotification('Failed to copy PGN');
            });
        } else {
            this.showNotification('No PGN available');
        }
        $("#quick-menu").removeClass('show');
    }

    handleDownloadPgn() {
        const pgn = this.chessUI.game?.pgn || '';
        if (pgn) {
            const blob = new Blob([pgn], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `chess-game-${new Date().toISOString().split('T')[0]}.pgn`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            this.showNotification('PGN downloaded!');
        } else {
            this.showNotification('No PGN available');
        }
        $("#quick-menu").removeClass('show');
    }

    /**
     * Checks if evaluation data exists for the current position and updates the show-best button state
     * @param {Object} node - The current move tree node
     */
    updateShowBestButtonState(node) {
        const currentFen = node.fen || (node.move ? node.move.after : null);
        
        if (!currentFen) {
            $("#show-best-btn").prop('disabled', true);
            $("#show-best").addClass('disabled');
            return;
        }

        let hasEvaluation = false;
        
        // Check in the processed moves from evaluation queue
        if (this.chessUI.evaluationQueue.processedMoves.has(node.id)) {
            const processed = this.chessUI.evaluationQueue.processedMoves.get(node.id);
            if (processed?.move?.lines && processed.move.lines.length > 0) {
                hasEvaluation = true;
            }
        }
        
        // If not found, check in analysis moves (for analyzed games)
        if (!hasEvaluation && this.chessUI.analysis?.moves) {
            const analysisMove = this.chessUI.analysis.moves.find(m => m.fen === currentFen);
            if (analysisMove?.lines && analysisMove.lines.length > 0) {
                hasEvaluation = true;
            }
        }
        
        // Enable or disable the button and quick menu item based on evaluation availability
        // But keep it disabled if continuation is in progress
        if (this.continuationInProgress) {
            $("#show-best-btn").prop('disabled', true);
            $("#show-best").addClass('disabled');
        } else {
            $("#show-best-btn").prop('disabled', !hasEvaluation);
            $("#show-best").toggleClass('disabled', !hasEvaluation);
        }
    }

    async handleShowBest() {
        $("#quick-menu").removeClass('show');
        
        // Check if we're in "go back" mode (continuation is complete)
        if (this.continuationComplete && this.badMoveNode) {
            this.goBackToBadMove();
            return;
        }
        
        const currentNode = this.chessUI.moveTree.currentNode;
        
        // Check if we're on a bad move - if so, show best continuation
        if (this.isBadMove(currentNode.classification)) {
            // Store the bad move node for later "go back"
            this.badMoveNode = currentNode;
            this.continuationComplete = false;
            
            // Show best continuation sequence for bad moves
            await this.showBestContinuation();
            return;
        }
        
        // Normal behavior for non-bad moves
        const currentFen = currentNode.fen || (currentNode.move ? currentNode.move.after : null);
        
        if (!currentFen) {
            return;
        }

        // Check if we already have evaluation for this position
        let evaluationData = null;
        
        // Check in the processed moves from evaluation queue
        if (this.chessUI.evaluationQueue.processedMoves.has(currentNode.id)) {
            const processed = this.chessUI.evaluationQueue.processedMoves.get(currentNode.id);
            if (processed?.move?.lines && processed.move.lines.length > 0) {
                evaluationData = processed.move;
            }
        }
        
        // If not found, check in analysis moves (for analyzed games)
        if (!evaluationData && this.chessUI.analysis?.moves) {
            const analysisMove = this.chessUI.analysis.moves.find(m => m.fen === currentFen);
            if (analysisMove?.lines && analysisMove.lines.length > 0) {
                evaluationData = analysisMove;
            }
        }
        
        // If still no evaluation, request one
        if (!evaluationData) {
            // Disable the button and quick menu item during evaluation
            $("#show-best-btn").prop('disabled', true);
            $("#show-best").addClass('disabled');
            
            // Show "Analysing..." in move-info
            const $moveInfo = $(".move-info").empty();
            const $placeholder = $("<div>").addClass("move-info-placeholder");
            $("<span>").text("Analysing...").appendTo($placeholder);
            $placeholder.appendTo($moveInfo);
            
            try {
                // Import Engine class
                const { Engine } = await import('../../evaluation/Engine.js');
                const { MoveEvaluator } = await import('../../evaluation/MoveEvaluator.js');
                
                // Try cloud evaluation first
                let lines = await MoveEvaluator.tryCloudEvaluation(currentFen);
                
                // If no cloud evaluation, use local engine
                if (!lines || lines.length === 0) {
                    const engineType = this.chessUI.settingsMenu?.getSettingValue('engineType') || 'stockfish-17.1-lite';
                    const threadCount = this.chessUI.settingsMenu?.getSettingValue('engineThreads') ?? 0;
                    const engine = new Engine({ engineType: engineType, threadCount: threadCount });
                    const depth = this.chessUI.settingsMenu?.getSettingValue('engineDepth') || 16;
                    const maxMoveTime = this.chessUI.settingsMenu?.getSettingValue('maxMoveTime') || 5;
                    
                    lines = await this.chessUI.evaluationQueue.evaluateWithEngine(
                        currentFen, 
                        depth, 
                        0, 
                        100, 
                        engine, 
                        maxMoveTime
                    );
                    
                    // Clean up engine
                    if (engine && engine.worker) {
                        engine.worker.terminate();
                    }
                }
                
                if (lines && lines.length > 0) {
                    evaluationData = { lines: lines };
                    
                    // Store evaluation in processed moves cache for future use
                    if (!this.chessUI.evaluationQueue.processedMoves.has(currentNode.id)) {
                        this.chessUI.evaluationQueue.processedMoves.set(currentNode.id, {
                            move: { fen: currentFen, lines: lines }
                        });
                    }
                    
                    // Enable the button and quick menu item now that we have evaluation
                    $("#show-best-btn").prop('disabled', false);
                    $("#show-best").removeClass('disabled');
                } else {
                    // Restore move-info display
                    MoveInformation.updateMoveInfo(currentNode, this.chessUI.moveTree.getPreviousMove());
                    return;
                }
            } catch (error) {
                console.error('Error evaluating position:', error);
                // Restore move-info display
                MoveInformation.updateMoveInfo(currentNode, this.chessUI.moveTree.getPreviousMove());
                return;
            }
        }
        
        // Extract the best move (first line, id 1)
        const bestLine = evaluationData.lines.find(line => line.id === 1);
        
        if (!bestLine || !bestLine.uciMove) {
            // Restore move-info display
            MoveInformation.updateMoveInfo(currentNode, this.chessUI.moveTree.getPreviousMove());
            return;
        }
        
        // Restore move-info display
        MoveInformation.updateMoveInfo(currentNode, this.chessUI.moveTree.getPreviousMove());
        
        // Check if we should make the move or show an arrow
        const makeMove = this.chessUI.settingsMenu?.getSettingValue('showBestMakeMove');
        
        if (makeMove === true || makeMove === 'true') {
            // Make the best move
            const uciMove = bestLine.uciMove;
            const from = uciMove.substring(0, 2);
            const to = uciMove.substring(2, 4);
            const promotion = uciMove.length > 4 ? uciMove.substring(4, 5) : undefined;
            
            // Use Chess.js to make the move
            const moveResult = this.chessUI.board.chess.move({
                from: from,
                to: to,
                promotion: promotion
            });
            
            if (moveResult) {
                // Animate the move on the board
                this.chessUI.board.move(moveResult, true, undefined, moveResult.before, false, moveResult.promotion, false);
                
                // Add the move to the tree
                const newNode = this.chessUI.moveTree.addMove(moveResult, this.chessUI.moveTree.currentNode.id);
                newNode.evaluationStatus = 'pending';
                
                // Update navigation
                this.chessUI.moveTree.navigateTo(newNode.id);
                this.chessUI.moveTree.render('move-tree', (node) => this.handleTreeNodeClick(node));
                this.updateAfterMove(newNode);
                
                // Queue for evaluation
                const fenBefore = moveResult.before;
                const fenAfter = moveResult.after;
                this.queueMoveForEvaluation(newNode, fenAfter, fenBefore);
            }
        } else {
            // Display the hint arrow with a distinct color (yellow/gold for hint)
            const hintColor = 'rgba(241, 196, 15, 0.75)'; // Gold color for hint
            this.chessUI.board.clearBestMoveArrows();
            this.chessUI.board.addBestMoveArrow(bestLine.uciMove, hintColor, 0.9);
            
            // Store the hint arrow timeout so we can clear it when user navigates
            if (this.hintArrowTimeout) {
                clearTimeout(this.hintArrowTimeout);
            }
            
            // Auto-clear the hint arrow after 5 seconds
            this.hintArrowTimeout = setTimeout(() => {
                this.chessUI.board.clearBestMoveArrows();
                // Restore normal arrows if in a game with analysis
                if (this.chessUI.analysis?.moves) {
                    this.updateBoardArrows(currentNode);
                }
            }, 5000);
        }
    }

    /**
     * Checks if a move classification is considered "bad"
     * @param {string} classification - The move classification
     * @returns {boolean} True if the move is bad
     */
    isBadMove(classification) {
        const badClassifications = ['blunder', 'mistake', 'inaccuracy', 'miss'];
        return classification && badClassifications.includes(classification.toLowerCase());
    }

    /**
     * Updates the visibility of the show-best button based on move classification
     * Shows the button when on a bad move, even if the dedicated button setting is off
     * @param {Object} node - The current move tree node
     */
    updateShowBestButtonVisibility(node) {
        // Don't show in learning mode
        if (this.chessUI.mistakeLearner?.isActive) {
            return;
        }

        const showBestButtonSetting = this.chessUI.settingsMenu?.getSettingValue('showBestButton');
        const isBadMove = this.isBadMove(node.classification);
        
        // Icon SVGs
        const magnifierStarIcon = `<svg aria-hidden="true" data-glyph="tool-magnifier-star" viewBox="0 0 24 24" height="20" width="20" xmlns="http://www.w3.org/2000/svg"><path xmlns="http://www.w3.org/2000/svg" d="M10.9999 18.3299C15.1499 18.3299 18.3299 15.1399 18.3299 10.9999C18.3299 6.84992 15.1399 3.66992 10.9999 3.66992C6.84992 3.66992 3.66992 6.85992 3.66992 10.9999C3.66992 15.1499 6.85992 18.3299 10.9999 18.3299ZM10.9999 21.3299C5.20992 21.3299 0.669922 16.7799 0.669922 10.9999C0.669922 5.20992 5.21992 0.669922 10.9999 0.669922C16.7899 0.669922 21.3299 5.21992 21.3299 10.9999C21.3299 16.7899 16.7799 21.3299 10.9999 21.3299ZM21.6699 23.5699C21.1399 23.5699 20.6399 23.3699 19.8699 22.4999L16.3699 18.8299L18.8399 16.3599L22.4399 19.7899C23.3699 20.5899 23.5699 21.1199 23.5699 21.6599C23.5699 22.6899 22.6999 23.5599 21.6699 23.5599V23.5699ZM7.99992 14.8299C7.82992 15.3599 8.02992 15.4599 8.46992 15.1599L10.9999 13.3599L13.4999 15.1599C13.9299 15.4599 14.1299 15.3599 13.9999 14.8299L13.2299 11.8299L15.4999 10.0599C15.8999 9.72992 15.8299 9.48992 15.2999 9.45992L12.3699 9.22992L11.2999 6.55992C11.0999 6.05992 10.8699 6.05992 10.6699 6.55992L9.66992 9.22992L6.66992 9.45992C6.13992 9.48992 6.06992 9.72992 6.49992 10.0599L8.76992 11.8299L7.99992 14.8299Z" fill="currentColor"></path></svg>`;
        const starIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 560"><path d="M280,0C125.4,0,0,125.4,0,280s125.4,280,280,280s280-125.4,280-280S434.6,0,280,0z M475.3,231.3l-114.5,83.2l43.8,134.6c1.9,6-5,11-10.1,7.3L280,373.2l-114.5,83.1c-5.1,3.8-12.1-1.3-10.1-7.3l43.8-134.6L84.7,231.2c-5.2-3.7-2.5-11.8,3.8-11.8H230l43.7-134.7c2-6,10.5-6,12.5,0L330,219.4h141.6C477.9,219.4,480.5,227.5,475.3,231.3z" fill="currentColor"/></svg>`;
        const goBackIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M125.7 160H176c17.7 0 32 14.3 32 32s-14.3 32-32 32H48c-17.7 0-32-14.3-32-32V64c0-17.7 14.3-32 32-32s32 14.3 32 32v51.2L97.6 97.6c87.5-87.5 229.3-87.5 316.8 0s87.5 229.3 0 316.8s-229.3 87.5-316.8 0c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0c62.5 62.5 163.8 62.5 226.3 0s62.5-163.8 0-226.3s-163.8-62.5-226.3 0L125.7 160z" fill="currentColor"/></svg>`;
        
        // Check if continuation is in progress - keep magnifier-star icon visible (but disabled)
        if (this.continuationInProgress) {
            // Don't change the icon during continuation - it's already set to magnifier-star and disabled
            return;
        }
        
        // Check if we're in "go back" mode (continuation complete)
        if (this.continuationComplete && this.badMoveNode) {
            // Show the button with go back icon
            $('#show-best-btn').html(goBackIcon).show();
            $('#skip-to-end').hide();
            $('#show-best').hide();
            return;
        }
        
        if (isBadMove) {
            // Show the button with magnifier-star icon when on a bad move
            $('#show-best-btn').html(magnifierStarIcon).show();
            $('#skip-to-end').hide();
            $('#show-best').hide(); // Hide quick menu item too
        } else {
            // Restore normal star icon
            $('#show-best-btn').html(starIcon);
            
            // Restore normal visibility based on setting
            if (showBestButtonSetting === true || showBestButtonSetting === 'true') {
                $('#show-best-btn').show();
                $('#skip-to-end').hide();
                $('#show-best').hide();
            } else {
                $('#show-best-btn').hide();
                $('#skip-to-end').show();
                $('#show-best').show();
            }
        }
    }

    /**
     * Executes a best continuation sequence: takes back bad move, plays best player move,
     * best opponent response, and best player move again
     */
    async showBestContinuation() {
        const currentNode = this.chessUI.moveTree.currentNode;
        const prevNode = this.chessUI.moveTree.getPreviousMove();
        
        if (!prevNode) {
            return;
        }

        // Mark continuation as in progress
        this.continuationInProgress = true;

        // Disable the button during continuation (keep icon visible but greyed out)
        $('#show-best-btn').prop('disabled', true);
        $('#show-best').addClass('disabled');

        // Step 1: Take back the bad move
        this.handleBackwardMove();
        
        // Wait for animation
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Step 2: Get evaluation for the position before bad move and play best move
        const move1 = await this.playBestMoveFromEvaluation();
        if (!move1) {
            // Re-enable button if failed
            this.continuationInProgress = false;
            $('#show-best-btn').prop('disabled', false);
            $('#show-best').removeClass('disabled');
            return;
        }
        
        await new Promise(resolve => setTimeout(resolve, 400));
        
        // Step 3: Get evaluation and play best opponent response
        const move2 = await this.playBestMoveFromEvaluation();
        if (!move2) {
            // Re-enable button if failed
            this.continuationInProgress = false;
            $('#show-best-btn').prop('disabled', false);
            $('#show-best').removeClass('disabled');
            return;
        }
        
        await new Promise(resolve => setTimeout(resolve, 400));
        
        // Step 4: Get evaluation and play best player move again
        await this.playBestMoveFromEvaluation();
        
        // Mark continuation as complete and no longer in progress
        this.continuationInProgress = false;
        this.continuationComplete = true;
        
        // Re-enable the button now that continuation is complete
        $('#show-best-btn').prop('disabled', false);
        $('#show-best').removeClass('disabled');
        
        // Update button to show "go back" icon
        this.updateShowBestButtonVisibility(this.chessUI.moveTree.currentNode);
    }

    /**
     * Navigates back to the bad move that triggered the continuation
     */
    goBackToBadMove() {
        if (!this.badMoveNode) {
            return;
        }
        
        // Set flag to prevent resetting state during navigation
        this._isGoingBackToBadMove = true;
        
        // Navigate to the bad move
        this.handleTreeNodeClick(this.badMoveNode);
        
        // Reset the state after navigation
        this.badMoveNode = null;
        this.continuationComplete = false;
        this.continuationInProgress = false;
        
        // Update button back to normal state
        this.updateShowBestButtonVisibility(this.chessUI.moveTree.currentNode);
    }

    /**
     * Plays a move from UCI notation
     * @param {string} uciMove - The UCI move string (e.g., "e2e4")
     * @param {boolean} waitForEvaluation - Whether to wait for evaluation to complete
     * @returns {Object|null} The move result or null if failed
     */
    async playBestMoveFromUCI(uciMove, waitForEvaluation = false) {
        const from = uciMove.substring(0, 2);
        const to = uciMove.substring(2, 4);
        const promotion = uciMove.length > 4 ? uciMove.substring(4, 5) : undefined;
        
        const moveResult = this.chessUI.board.chess.move({
            from: from,
            to: to,
            promotion: promotion
        });
        
        if (moveResult) {
            this.chessUI.board.move(moveResult, true, undefined, moveResult.before, false, moveResult.promotion, false);
            
            const newNode = this.chessUI.moveTree.addMove(moveResult, this.chessUI.moveTree.currentNode.id);
            newNode.evaluationStatus = 'pending';
            
            this.chessUI.moveTree.navigateTo(newNode.id);
            this.chessUI.moveTree.render('move-tree', (node) => this.handleTreeNodeClick(node));
            this.updateAfterMove(newNode);
            
            const fenBefore = moveResult.before;
            const fenAfter = moveResult.after;
            
            if (waitForEvaluation) {
                // Wait for evaluation to complete
                await this.waitForEvaluation(newNode, fenAfter, fenBefore);
            } else {
                this.queueMoveForEvaluation(newNode, fenAfter, fenBefore);
            }
            
            return moveResult;
        }
        
        return null;
    }

    /**
     * Waits for a move's evaluation to complete
     * @param {Object} node - The move node to evaluate
     * @param {string} resultFen - The FEN after the move
     * @param {string} prevFen - The FEN before the move
     * @returns {Promise} Resolves when evaluation is complete
     */
    async waitForEvaluation(node, resultFen, prevFen) {
        return new Promise((resolve) => {
            this.chessUI.evaluationQueue.addToQueue(node, resultFen, prevFen, (evaluatedMove) => {
                // Update classification and evaluation data
                this.chessUI.moveTree.updateClassification(node.id, evaluatedMove);
                node.evaluationStatus = 'complete';

                const topLine = evaluatedMove.lines.find(line => line.id === 1);
                if (topLine) {
                    node.evalScore = topLine.score;
                    node.evalType = topLine.type || 'cp';
                }

                // Update UI if this is the current node
                const currentNode = this.chessUI.moveTree.currentNode;
                if (currentNode.id === node.id && node.move) {
                    const fromIdx = this.chessUI.board.algebraicToIndex(node.move.from, this.chessUI.board.flipped);
                    const toIdx = this.chessUI.board.algebraicToIndex(node.move.to, this.chessUI.board.flipped);

                    this.chessUI.board.addClassification(
                        evaluatedMove.classification.type,
                        this.chessUI.board.getSquare(fromIdx, this.chessUI.board.flipped),
                        this.chessUI.board.getSquare(toIdx, this.chessUI.board.flipped)
                    );
                }

                this.chessUI.moveTree.render('move-tree', (node) => this.handleTreeNodeClick(node));
                this.updateAfterMove(currentNode);
                
                // Update show-best button state for the evaluated node if it's current
                if (currentNode.id === node.id) {
                    this.updateShowBestButtonState(currentNode);
                }

                resolve();
            }, this.chessUI.moveTree);
        });
    }

    /**
     * Evaluates current position and plays the best move
     * @param {boolean} waitForEvaluation - Whether to wait for the move's evaluation to complete
     * @returns {Object|null} The move result or null if failed
     */
    async playBestMoveFromEvaluation(waitForEvaluation = true) {
        const currentNode = this.chessUI.moveTree.currentNode;
        const currentFen = currentNode.fen || (currentNode.move ? currentNode.move.after : null);
        
        if (!currentFen) {
            return null;
        }

        // Check if we already have evaluation
        let evaluationData = null;
        
        if (this.chessUI.evaluationQueue.processedMoves.has(currentNode.id)) {
            const processed = this.chessUI.evaluationQueue.processedMoves.get(currentNode.id);
            if (processed?.move?.lines && processed.move.lines.length > 0) {
                evaluationData = processed.move;
            }
        }
        
        if (!evaluationData && this.chessUI.analysis?.moves) {
            const analysisMove = this.chessUI.analysis.moves.find(m => m.fen === currentFen);
            if (analysisMove?.lines && analysisMove.lines.length > 0) {
                evaluationData = analysisMove;
            }
        }
        
        // If no evaluation, request one
        if (!evaluationData) {
            try {
                const { Engine } = await import('../../evaluation/Engine.js');
                const { MoveEvaluator } = await import('../../evaluation/MoveEvaluator.js');
                
                let lines = await MoveEvaluator.tryCloudEvaluation(currentFen);
                
                if (!lines || lines.length === 0) {
                    const engineType = this.chessUI.settingsMenu?.getSettingValue('engineType') || 'stockfish-17.1-lite';
                    const threadCount = this.chessUI.settingsMenu?.getSettingValue('engineThreads') ?? 0;
                    const depth = this.chessUI.settingsMenu?.getSettingValue('engineDepth') || 18;
                    
                    const engine = await Engine.createEngine(engineType, threadCount);
                    lines = await engine.analyzePosition(currentFen, depth);
                }
                
                if (lines && lines.length > 0) {
                    evaluationData = { lines };
                }
            } catch (error) {
                console.error('Error evaluating position:', error);
                return null;
            }
        }
        
        if (!evaluationData) {
            return null;
        }
        
        const bestLine = evaluationData.lines.find(line => line.id === 1);
        if (!bestLine || !bestLine.uciMove) {
            return null;
        }
        
        return await this.playBestMoveFromUCI(bestLine.uciMove, waitForEvaluation);
    }

    showNotification(message) {
        // Create a simple notification
        const notification = $(`
            <div class="quick-notification" style="
                position: fixed;
                top: 20px;
                right: 20px;
                background: var(--sidebar-base);
                color: var(--text-primary);
                padding: 12px 20px;
                border-radius: 8px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
                z-index: 10000;
                font-size: 14px;
                border: 1px solid var(--dark-border);
                animation: slideInRight 0.3s ease;
            ">${message}</div>
        `);
        
        $('body').append(notification);
        
        setTimeout(() => {
            notification.fadeOut(300, () => notification.remove());
        }, 3000);
    }

    /**
     * Shows learning mode controls
     */
    showLearningControls() {
        $('.bottom-content .controls').addClass('learning-mode');
        
        // Use flexbox to reorder - leave button will use CSS order: -1 to go first
        const controls = $('.bottom-content .controls');
        controls.css('display', 'flex');
        
        // Show learning controls, hide only specific normal ones
        $('#hint, #leave-learning, #popup-quick-menu').show();
        $('#restart, #skip-to-end, #show-best-btn').hide();
        // Keep backward, forward, and popup-quick-menu visible - they work in both modes
        
        // Switch quick menu to learning settings
        $('.quick-menu-item:not(.learning-setting-item)').hide();
        $('.learning-setting-item').show();
        // Hide the inaccuracies toggle in learning mode
        $('#toggle-include-inaccuracies').hide();
        
        // Update toggle states based on current settings
        this.updateLearningSettingsToggles();
    }

    /**
     * Hides learning mode controls
     */
    hideLearningControls() {
        $('.bottom-content .controls').removeClass('learning-mode');
        
        // Remove inline flex styling
        $('.bottom-content .controls').css('display', '');
        
        // Hide learning controls
        $('#hint, #leave-learning').hide();
        
        // Restore navigation buttons (popup-quick-menu stays visible)
        $('#backward, #forward, #popup-quick-menu, #restart').show();
        
        // Show the correct button based on showBestButton setting
        const showBestButton = this.chessUI.settingsMenu?.getSettingValue('showBestButton');
        if (showBestButton === true || showBestButton === 'true') {
            $('#show-best-btn').show();
            $('#skip-to-end').hide();
            $('#show-best').hide();
        } else {
            $('#skip-to-end').show();
            $('#show-best-btn').hide();
            $('#show-best').show();
        }
        
        // Switch quick menu back to normal items
        $('.learning-setting-item').hide();
        $('.quick-menu-item:not(.learning-setting-item)').show();
    }

    /**
     * Handles hint button click
     */
    handleHint() {
        if (this.chessUI.mistakeLearner?.isActive) {
            this.chessUI.mistakeLearner.showHint();
        }
    }

    /**
     * Handles leave learning button click
     */
    handleLeaveLearning() {
        if (this.chessUI.mistakeLearner?.isActive) {
            this.chessUI.mistakeLearner.exit();
        }
    }

    /**
     * Handle toggling learning settings
     */
    handleToggleLearningSettings(settingKey) {
        const currentValue = this.chessUI.settingsMenu.getSettingValue(settingKey);
        const newValue = currentValue !== true;
        
        // Update the setting
        this.chessUI.settingsMenu.saveSettingToCookie(settingKey, newValue);
        
        // Update the toggle visual state
        this.updateLearningSettingsToggles();
    }

    /**
     * Update toggle states based on current settings
     */
    updateLearningSettingsToggles() {
        const autoAdvance = this.chessUI.settingsMenu.getSettingValue('autoAdvanceToNextMistake');
        const includeInaccuracies = this.chessUI.settingsMenu.getSettingValue('includeInaccuraciesInLearning');
        const enableConfetti = this.chessUI.settingsMenu.getSettingValue('enableConfetti');
        
        $('#toggle-auto-advance').toggleClass('active', autoAdvance !== false);
        $('#toggle-include-inaccuracies').toggleClass('active', includeInaccuracies !== false);
        $('#toggle-confetti').toggleClass('active', enableConfetti !== false);
    }
}