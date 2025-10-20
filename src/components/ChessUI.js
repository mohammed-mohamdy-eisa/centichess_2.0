import { Chess } from '../../libs/chess.js';

import { Chessboard } from './board/Chessboard.js';
import { MoveTree } from './moves/MoveTree.js';
import { MoveNavigator } from './moves/MoveNavigator.js';
import { EvaluationQueue } from '../evaluation/EvaluationQueue.js';

import { GamesList } from './games/GamesList.js';
import { GameStats } from './report/GameStats.js';
import { GameGraph } from './report/GameGraph.js';
import { EvaluationBar } from './board/EvaluationBar.js';
import { EngineLines } from './moves/EngineLines.js';
import { MoveInformation } from './moves/MoveInformation.js';
import { Clock } from './board/Clock.js';

import { MoveEvaluator } from '../evaluation/MoveEvaluator.js';
import { Classification } from '../classification/MoveClassifier.js';
import { SidebarOverlay } from './report/SidebarOverlay.js';
import { GameClassifier } from '../classification/GameClassifier.js';
import { SettingsMenu } from './settings/SettingsMenu.js';

/**
 * Manages UI interactions and board state
 */
export class ChessUI {
    /**
     * Initializes the Chess UI
     * @param {Board} board - The chess board instance
     * @param {MoveTree} moveTree - The move tree instance
     */
    constructor() {
        this.chess = new Chess();
        this.settingsMenu = new SettingsMenu('.settings-menu-container');
        
        // Load the board with settings from cookies
        this.board = new Chessboard("#chessboard", {
            theme: {
                boardDarkSquareColor: this.settingsMenu.getSettingValue('theme.boardDarkSquareColor') || 'rgba(110, 161, 118, 1)',
                boardLightSquareColor: this.settingsMenu.getSettingValue('theme.boardLightSquareColor') || 'rgba(224, 224, 224, 1)',
                pieceFolderName: this.settingsMenu.getSettingValue('pieceTheme') || 'cburnett'
            },
            showBoardLabels: this.settingsMenu.getSettingValue('theme.boardLabels') === 'letter' || true
        }, this.chess);

        this.settingsMenu.init(this.board);
        this.board.setOption({ isInteractive: false });

        this.moveTree = new MoveTree();
        this.moveNavigator = new MoveNavigator(this);
        this.evaluationQueue = new EvaluationQueue(this.settingsMenu);

        this.gamesList = new GamesList();

        GameGraph.render();
        GameGraph.setClickCallback((clickedMove) => {
            // Find the move index in the analysis moves array
            const moveIndex = this.analysis?.moves?.indexOf(clickedMove);
            if (moveIndex !== undefined && moveIndex >= 0) {
                // Map to mainline index (add 1 because mainline[0] is root)
                const mainlineIndex = moveIndex + 1;
                if (mainlineIndex < this.moveTree.mainline.length) {
                    const targetNode = this.moveTree.mainline[mainlineIndex];
                    this.moveNavigator.handleTreeNodeClick(targetNode);
                }
            }
        });

        GameStats.render();
        EvaluationBar.updateEvaluationBar();
        MoveInformation.updateMoveInfo(this.moveTree.mainline[0], this.moveTree.mainline[0]);
        EngineLines.updateEngineLines(this.moveTree.mainline[0],
            this.moveTree,
            (node) => this.moveNavigator.handleTreeNodeClick(node),
            (node, resultFen, prevFen) => this.moveNavigator.queueMoveForEvaluation(node, resultFen, prevFen)
        );
        
        // Initialize clocks to default state
        Clock.resetClocks();

        // Listen for board settings changes to update arrows instantly
        this.board.on('settingsChanged', () => {
            if (this.moveTree && this.moveTree.currentNode) {
                this.moveNavigator.updateBoardArrows(this.moveTree.currentNode);
            }
        });
    }

    async load(game) {
        this.moveNavigator.handleRestart();

        this.game = game;

        // Load PGN into the main Chess instance first
        this.chess.loadPgn(this.game.pgn);
        this.chess.reset(); // Reset to starting position for analysis
        
        this.moveTree.buildFromPGN(this.game.pgn, this.chess);

        // Set initial clocks before analysis starts
        Clock.setInitialClocks(this.moveTree, this.game.pgn);

        SidebarOverlay.show();
        SidebarOverlay.startFactCycling();
        SidebarOverlay.updateEvaluationProgress(0);

        this.board.fen(this.moveTree.mainline[0].fen);

        // Flip to face the username player
        const userIsBlack = this.game.username.toLowerCase() === this.game.black.name.toLowerCase();
        if (userIsBlack) {
            this.moveNavigator.handleFlipBoard();
        }

        $('.analysis-overlay').addClass('active');
        $('.tab-content, .bottom-content').addClass('blur-content');
        this.board.setOption({ isInteractive: false });

        const engineType = this.settingsMenu.getSettingValue('engineType');
        const engineDepth = this.settingsMenu.getSettingValue('engineDepth') || 16;
        const maxMoveTime = this.settingsMenu.getSettingValue('maxMoveTime') || 5;

        const analysis = await MoveEvaluator.analyzeGame(
            this.game, 
            (progress) => {
                SidebarOverlay.updateEvaluationProgress(progress);
            },
            { engineType, engineDepth, maxMoveTime }
        );

        this.board.setOption({ isInteractive: true });

        // Store analysis for click callback
        this.analysis = analysis;

        const graphedMoves = analysis.moves.map(move => move.graph / 100);

        const classify = new GameClassifier();
        const gameClass = classify.classifyGame(graphedMoves, userIsBlack ? 'w' : 'b', this.game.result);
        $(".game-info").empty().append(`<p>${gameClass.message}</p>`);

        SidebarOverlay.hide();
        SidebarOverlay.stopFactCycling();
    
        MoveEvaluator.applyClassificationsToMoveTree(this.moveTree, analysis.moves, this.game.pgn);
        GameGraph.setAnalysis(analysis);
        GameStats.render('.game-stats', analysis, game.white.name, game.black.name);

        this.moveTree.render('move-tree', (node) => {
            this.moveNavigator.handleTreeNodeClick(node);
        });

        $('.analysis-overlay').removeClass('active');
        $('.tab-content, .bottom-content').removeClass('blur-content');

        // Initialize clocks
        Clock.updateFromMoveTree(this.moveTree, this.board.flipped, this.game?.pgn);

        if (!this.eventHandlersSetup) {
            this.moveNavigator.setupEventHandlers();
            this.eventHandlersSetup = true;
        }
    }

    async cacheClassifications() {
        const classifications = Object.entries(Classification);
        const loadPromises = [];

        // Set up all classification loading in parallel
        $.each(classifications, (_, classif) => {
            const path = classif[1].src;
            const type = classif[1].type;

            const promise = $.ajax({
                url: path,
                dataType: 'text'
            })
            .then(svgText => {
                // Convert SVG to base64 data URI
                const base64 = btoa(unescape(encodeURIComponent(svgText)));
                const dataUri = `data:image/svg+xml;base64,${base64}`;

                // Create and cache the image
                const $img = $('<img>', {
                    src: dataUri,
                    class: 'move-icon',
                    alt: type
                })[0]; // Get the DOM element

                Classification[classif[0]].cachedImg = $img;
                return type;
            })
            .catch(error => {
                console.error(`Failed to load ${path}:`, error);
                return null;
            });

            loadPromises.push(promise);
        });

        // Wait for all classifications to load
        await Promise.allSettled(loadPromises);
    }
}