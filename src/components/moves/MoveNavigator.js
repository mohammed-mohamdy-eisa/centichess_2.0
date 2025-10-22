import { MoveInformation } from './MoveInformation.js';
import { EvaluationBar } from '../board/EvaluationBar.js';
import { EngineLines } from './EngineLines.js';
import { GameGraph } from '../report/GameGraph.js';
import { Clock } from '../board/Clock.js';

export class MoveNavigator {
    constructor(chessUI) {
        this.chessUI = chessUI;
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

        // Update board arrows per mode
        this.updateBoardArrows(node);
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
            const optimal = ['brilliant', 'great', 'perfect', 'theory', 'excellent'];
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
                // On opponent's turn: Only show best move (top alternative)
                const prevNode = this.chessUI.moveTree.getPreviousMove();
                if (prevNode) {
                    const prevFen = prevNode.fen || prevNode.move?.before;
                    const prevAnalysis = this.chessUI.analysis.moves.find(m => m.fen === prevFen);
                    const prevBest = prevAnalysis?.lines?.find(l => l.id === 1);
                    if (prevBest?.uciMove) {
                        this.chessUI.board.addBestMoveArrow(prevBest.uciMove, null, 0.85);
                    }
                }
            }
        }
    }

    handleForwardMove() {
        const nextNode = this.chessUI.moveTree.getNextMove();
        if (!nextNode || !nextNode.move) return;

        const classification = nextNode.classification;
        this.chessUI.board.move(nextNode.move, true, classification, nextNode.move.before, false, nextNode.move.promotion, false);

        this.chessUI.moveTree.navigateTo(nextNode.id);
        this.updateAfterMove(nextNode);
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
    }

    handleSkipToEnd() {
        const lastMove = this.chessUI.moveTree.getFinalMove();
        this.handleTreeNodeClick(lastMove);
    }

    handleUserMove(moveObj) {
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

        // Add classification to the board
        const fromIdx = this.chessUI.board.algebraicToIndex(moveNode.move.from, this.chessUI.board.flipped);
        const toIdx = this.chessUI.board.algebraicToIndex(moveNode.move.to, this.chessUI.board.flipped);
        this.chessUI.board.addClassification(
            moveNode.classification,
            this.chessUI.board.getSquare(fromIdx, this.chessUI.board.flipped),
            this.chessUI.board.getSquare(toIdx, this.chessUI.board.flipped)
        );

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
            this.chessUI.board.move(targetNode.move, true, targetNode.classification, targetNode.move.before, false, targetNode.move.promotion);
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
}