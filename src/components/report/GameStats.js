import { Classification } from '../../classification/MoveClassifier.js';

/**
 * GameStats utility class for displaying player statistics comparison
 */
export class GameStats {
    /**
     * Renders the game statistics UI to the specified container
     * @param {jQuery|string} container - The container element or selector
     * @param {Object} analysis - The game analysis data
     * @param {string} whiteName - White player name
     * @param {string} blackName - Black player name
     */
    static render(container = '.game-stats', analysis, whiteName = 'White', blackName = 'Black') {
        if (!analysis) {
            // Empty analysis
            analysis = {
                white: {
                    accuracy: 0,
                    counts: {},
                    elo: 0
                },
                black: {
                    accuracy: 0,
                    counts: {},
                    elo: 0
                },
                phaseClassifications: {
                    white: {
                        opening: Classification.GOOD,
                        middlegame: Classification.GOOD,
                        endgame: Classification.GOOD
                    },
                    black: {
                        opening: Classification.GOOD,
                        middlegame: Classification.GOOD,
                        endgame: Classification.GOOD
                    }
                }
            }
        }

        const $container = $(container);
        $container.empty();
        
        const statsContainer = $('<div class="stats-comparison"></div>');
        
        const phaseClassifications = analysis.phaseClassifications;

        // Add all sections
        statsContainer
            .append(this.createPlayersHeader(whiteName, blackName))
            .append('<hr class="stats-divider">')
            .append(this.createStatsRow('Accuracy', 
                (analysis.white.accuracy * 100).toFixed(1), 
                (analysis.black.accuracy * 100).toFixed(1), 
                true))
            .append('<hr class="stats-divider">')
            .append(this.createMovesSection(analysis))
            .append('<hr class="stats-divider">')
            .append(this.createStatsRow('Game Rating', 
                analysis.white.elo ? Math.ceil(analysis.white.elo / 10) * 10 : 1400, 
                analysis.black.elo ? Math.ceil(analysis.black.elo / 10) * 10 : 1400, 
                true))
            .append(this.createPhaseClassificationsRow('Opening', phaseClassifications?.white?.opening, phaseClassifications?.black?.opening, analysis.phaseAnalysis?.opening))
            .append(this.createPhaseClassificationsRow('Middlegame', phaseClassifications?.white?.middlegame, phaseClassifications?.black?.middlegame, analysis.phaseAnalysis?.middlegame))
            .append(this.createPhaseClassificationsRow('Endgame', phaseClassifications?.white?.endgame, phaseClassifications?.black?.endgame, analysis.phaseAnalysis?.endgame))
            .append(this.createLearnButton())
            .append(this.createStartReviewButton());



        $container.append(statsContainer);

        // Create (or replace) a single tooltip element for phase accuracy
        $('#phase-accuracy-tooltip').remove();
        const $tooltip = $('<div id="phase-accuracy-tooltip"></div>')
            .css({
                position: 'absolute',
                zIndex: 9999,
                background: '#1a1a1a',
                color: '#fff',
                padding: '12px 18px',
                borderRadius: '12px',
                fontSize: '13px',
                fontWeight: '600',
                boxShadow: '0 10px 25px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.35)',
                pointerEvents: 'none',
                display: 'none',
                opacity: 0,
                transform: 'translateY(4px) scale(0.98)',
                transition: 'opacity 150ms ease, transform 150ms ease'
            })
            .appendTo('body');

        // Arrow element for bubble look
        const $arrow = $('<div></div>')
            .css({
                position: 'absolute',
                width: 0,
                height: 0,
                borderLeft: '8px solid transparent',
                borderRight: '8px solid transparent',
                borderTop: '8px solid #1a1a1a',
            });
        $tooltip.append($arrow);

        // Hide tooltip helper (animate out, then hide)
        const hideTooltip = () => {
            $tooltip.css({ opacity: 0, transform: 'translateY(4px) scale(0.98)' });
            setTimeout(() => { $tooltip.hide(); }, 160);
        };

        // Helper: position and animate in tooltip for a given icon
        const showTooltipForIcon = (iconEl, label) => {
            $tooltip.text(label).append($arrow).show();
            // reset for animation in
            $tooltip.css({ opacity: 0, transform: 'translateY(4px) scale(0.98)' });

            const rect = iconEl.getBoundingClientRect();
            const tooltipWidth = $tooltip.outerWidth();
            const tooltipHeight = $tooltip.outerHeight();
            let top = window.scrollY + rect.top - tooltipHeight - 14;
            let left = window.scrollX + rect.left + (rect.width / 2) - (tooltipWidth / 2);
            let placeBelow = false;
            if (top < window.scrollY) { top = window.scrollY + rect.bottom + 14; placeBelow = true; }
            $tooltip.css({ top: `${top}px`, left: `${left}px` });
            const arrowLeft = tooltipWidth / 2 - 8;
            if (placeBelow) {
                $arrow.css({ top: '-8px', left: `${arrowLeft}px`, borderTop: 'none', borderBottom: '8px solid #1a1a1a' });
            } else {
                $arrow.css({ top: `${tooltipHeight - 1}px`, left: `${arrowLeft}px`, borderBottom: 'none', borderTop: '8px solid #1a1a1a' });
            }
            requestAnimationFrame(() => {
                $tooltip.css({ opacity: 1, transform: 'translateY(0) scale(1)' });
            });
        };

        // Tap/click handler on icons (namespace to avoid duplicate handlers on re-render)
        statsContainer.off('click.phaseTooltip mouseenter.phaseTooltip mouseleave.phaseTooltip');
        statsContainer.on('click.phaseTooltip', '.phase-accuracy-icon', function(e) {
            e.stopPropagation();
            const $icon = $(this);
            const acc = $icon.data('accuracy');
            if (typeof acc !== 'number') return;
            const label = `Accuracy: ${(acc * 100).toFixed(1)}`;
            showTooltipForIcon(this, label);
        });

        // Hover handlers (show on mouseenter, hide on mouseleave)
        statsContainer.on('mouseenter.phaseTooltip', '.phase-accuracy-icon', function() {
            const $icon = $(this);
            const acc = $icon.data('accuracy');
            if (typeof acc !== 'number') return;
            const label = `Accuracy: ${(acc * 100).toFixed(1)}`;
            showTooltipForIcon(this, label);
        });
        statsContainer.on('mouseleave.phaseTooltip', '.phase-accuracy-icon', function() {
            hideTooltip();
        });

        // Global listeners to hide tooltip
        $(document).off('click.phaseTooltip').on('click.phaseTooltip', hideTooltip);
        $(window).off('scroll.phaseTooltip resize.phaseTooltip').on('scroll.phaseTooltip resize.phaseTooltip', hideTooltip);
    }

    /**
     * Creates the players header row
     * @param {string} whiteName - White player name
     * @param {string} blackName - Black player name
     * @returns {jQuery} The players header element
     */
    static createPlayersHeader(whiteName, blackName) {
        return $(`<div class="stats-row">
            <div class="stats-label"></div>
            <div class="stats-player">${whiteName}</div>
            <div class="stats-icon"></div>
            <div class="stats-player">${blackName}</div>
        </div>`);
    }

    /**
     * Creates a statistics row
     * @param {string} label - The row label
     * @param {string} whiteValue - White player value
     * @param {string} blackValue - Black player value
     * @param {boolean} useBoxes - Whether to use boxes for styling
     * @returns {jQuery} The stats row element
     */
    static createStatsRow(label, whiteValue, blackValue, useBoxes = false) {
        const whiteEl = useBoxes 
        ? `<div class="stats-box white">${whiteValue}</div>` 
        : `<div class="stats-count">${whiteValue}</div>`;
    
        const blackEl = useBoxes 
            ? `<div class="stats-box black">${blackValue}</div>` 
            : `<div class="stats-count"></div>`;

        return $(`<div class="stats-row">
            <div class="stats-label">${label}</div>
            ${whiteEl}
            <div class="stats-icon"></div>
            ${blackEl}
        </div>`);
    }

    static createPhaseClassificationsRow(label, whiteClassification, blackClassification, phaseAccuracies) {
        const row = $(`<div class="stats-row">
            <div class="stats-label">${label}</div>
            <div id="white-icon" class=" stats-count"></div>
            <div class="stats-icon"></div>
            <div id="black-icon" class=" stats-count"></div>
        </div>`);

        let whiteIcon = $(`<p class="stats-label no-padding">-</p>`);
        let blackIcon = $(`<p class="stats-label no-padding">-</p>`);

        if (whiteClassification) {
            const acc = typeof phaseAccuracies?.white?.accuracy === 'number' ? phaseAccuracies.white.accuracy : null;
            const title = acc !== null ? `Accuracy: ${(acc * 100).toFixed(1)}` : '';
            whiteIcon = $(`<img src="${whiteClassification?.src || '-'}" alt="White" class="stats-icon phase-accuracy-icon" title="${title}">`);
            if (acc !== null) whiteIcon.attr('data-accuracy', acc);
        }
        if (blackClassification) {
            const acc = typeof phaseAccuracies?.black?.accuracy === 'number' ? phaseAccuracies.black.accuracy : null;
            const title = acc !== null ? `Accuracy: ${(acc * 100).toFixed(1)}` : '';
            blackIcon = $(`<img src="${blackClassification?.src || '-'}" alt="Black" class="stats-icon phase-accuracy-icon" title="${title}">`);
            if (acc !== null) blackIcon.attr('data-accuracy', acc);
        }

        row.find('#white-icon').append(whiteIcon);
        row.find('#black-icon').append(blackIcon);

        return row;
    }

    /**
     * Creates the moves section with classification counts
     * @param {Object} analysis - The game analysis data
     * @returns {jQuery} The moves section element
     */
    static createMovesSection(analysis) {
        const movesSection = $('<div class="stats-moves"></div>');

        // Classifications to show when collapsed (default)
        const collapsedClassifications = [
            Classification.BRILLIANT, 
            Classification.GREAT, 
            Classification.BEST, 
            Classification.MISTAKE,
            Classification.MISS,
            Classification.BLUNDER
        ];

        // Additional classifications to show when expanded
        const expandedClassifications = [
            Classification.EXCELLENT, 
            Classification.GOOD, 
            Classification.THEORY,
            Classification.INACCURACY
        ];

        // All classifications in order for expanded view
        const allClassifications = [
            Classification.BRILLIANT, 
            Classification.GREAT, 
            Classification.BEST, 
            Classification.EXCELLENT, 
            Classification.GOOD, 
            Classification.THEORY,
            Classification.INACCURACY, 
            Classification.MISTAKE,
            Classification.MISS,
            Classification.BLUNDER
        ];

        // Track if section is collapsed (default is collapsed)
        let isCollapsed = true;

        // Create expand/collapse button
        const expandButton = $(`<div class="stats-expand-button">
            <span class="expand-icon">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            </span>
            <span class="expand-text">Show more</span>
        </div>`);

        // Create rows for all classifications
        allClassifications.forEach(classif => {
            const whiteCount = analysis.white.counts[classif.type] || 0;
            const blackCount = analysis.black.counts[classif.type] || 0;
            
            const label = classif.type.charAt(0).toUpperCase() + classif.type.slice(1);
            const row = $(`<div class="stats-row stats-classification-row">
                <div class="stats-label">${label}</div>
                <div class="stats-count stats-move ${classif.class}" data-player="white" data-classification="${classif.type}">${whiteCount}</div>
                <div class="stats-icon"></div>
                <div class="stats-count stats-move ${classif.class}" data-player="black" data-classification="${classif.type}">${blackCount}</div>
            </div>`);
            
            // Add classification icon if available
            if (classif.cachedImg) {
                row.find('.stats-icon').append(classif.cachedImg.cloneNode(true));
            } else {
                // Manually add the icon
                const icon = $(`<img src="${classif.src}" alt="${classif.type}" class="stats-icon">`);
                row.find('.stats-icon').append(icon);
            }

            // Mark expandable rows (those only shown when expanded)
            if (expandedClassifications.includes(classif)) {
                row.addClass('stats-expandable-row');
            }
            
            // Add click handlers to navigate to first move with this classification
            row.find('.stats-move').each(function() {
                const $count = $(this);
                const count = parseInt($count.text());
                
                // Only make clickable if count > 0
                if (count > 0) {
                    $count.css('cursor', 'pointer');
                    $count.on('click', function() {
                        const player = $(this).data('player');
                        const classificationType = $(this).data('classification');
                        GameStats.navigateToClassification(classificationType, player);
                    });
                }
            });
            
            movesSection.append(row);
        });

        // Add expand button after all rows
        movesSection.append(expandButton);

        // Add click handler for expand/collapse
        expandButton.on('click', function() {
            isCollapsed = !isCollapsed;
            
            if (isCollapsed) {
                movesSection.find('.stats-expandable-row').slideUp(200);
                expandButton.find('.expand-text').text('Show more');
                expandButton.find('.expand-icon svg').css('transform', 'rotate(0deg)');
            } else {
                movesSection.find('.stats-expandable-row').slideDown(200);
                expandButton.find('.expand-text').text('Show less');
                expandButton.find('.expand-icon svg').css('transform', 'rotate(180deg)');
            }
        });

        // Hide expandable rows initially (collapsed state)
        movesSection.find('.stats-expandable-row').hide();
        
        return movesSection;
    }

    /**
     * Creates the "Learn from Mistakes" button
     * @returns {jQuery} The learn button element
     */
    static createLearnButton() {
        return $(`
            <button id="learn-from-mistakes" class="learn-button">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512" width="18" height="18" fill="currentColor">
                    <path d="M320 32c-8.1 0-16.1 1.4-23.7 4.1L15.8 137.4C6.3 140.9 0 149.9 0 160s6.3 19.1 15.8 22.6l57.9 20.9C57.3 229.3 48 259.8 48 291.9l0 28.1c0 28.4-10.8 57.7-22.3 80.8c-6.5 13-13.9 25.8-22.5 37.6C0 442.7-.9 448.3 .9 453.4s6 8.9 11.2 10.2l64 16c4.2 1.1 8.7 .3 12.4-2s6.3-6.1 7.1-10.4c8.6-42.8 4.3-81.2-2.1-108.7C90.3 344.3 86 329.8 80 316.5l0-24.6c0-30.2 10.2-58.7 27.9-81.5c12.9-15.5 29.6-28 49.2-35.7l157-61.7c8.2-3.2 17.5 .8 20.7 9s-.8 17.5-9 20.7l-157 61.7c-12.4 4.9-23.3 12.4-32.2 21.6l159.6 57.6c7.6 2.7 15.6 4.1 23.7 4.1s16.1-1.4 23.7-4.1L624.2 182.6c9.5-3.4 15.8-12.5 15.8-22.6s-6.3-19.1-15.8-22.6L343.7 36.1C336.1 33.4 328.1 32 320 32zM128 408c0 35.3 86 72 192 72s192-36.7 192-72L496.7 262.6 354.5 314c-11.1 4-22.8 6-34.5 6s-23.5-2-34.5-6L143.3 262.6 128 408z"/>
                </svg>
                Learn from Mistakes
            </button>
        `);
    }

    /**
     * Creates the "Start Review" button
     * @returns {jQuery} The start review button element
     */
    static createStartReviewButton() {
        return $(`
                <button id="start-review" class="learn-button">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 560" width="18" height="18" fill="currentColor">
                    <path d="M280,0C125.4,0,0,125.4,0,280s125.4,280,280,280s280-125.4,280-280S434.6,0,280,0z M475.3,231.3l-114.5,83.2l43.8,134.6c1.9,6-5,11-10.1,7.3L280,373.2l-114.5,83.1c-5.1,3.8-12.1-1.3-10.1-7.3l43.8-134.6L84.7,231.2c-5.2-3.7-2.5-11.8,3.8-11.8H230l43.7-134.7c2-6,10.5-6,12.5,0L330,219.4h141.6C477.9,219.4,480.5,227.5,475.3,231.3z"/>
                </svg>
                Start Review
            </button>
        `);
    }

    /**
     * Navigates to the first move with the specified classification for the specified player
     * @param {string} classificationType - The classification type to search for
     * @param {string} player - 'white' or 'black'
     */
    static navigateToClassification(classificationType, player) {
        // Get ChessUI instance from window (set by analysis.js)
        const chessUI = window.chessUI;
        if (!chessUI || !chessUI.analysis || !chessUI.moveTree) {
            console.warn('ChessUI not available for navigation');
            return;
        }

        const analysis = chessUI.analysis;
        
        // Determine if user is playing white or black
        const username = chessUI.game.username?.toLowerCase();
        const whiteName = chessUI.game.white?.name?.toLowerCase();
        const blackName = chessUI.game.black?.name?.toLowerCase();
        const userIsWhite = username === whiteName;
        
        // Determine if we're looking for user's moves or opponent's moves
        const isUserMove = (player === 'white' && userIsWhite) || (player === 'black' && !userIsWhite);
        
        // Find the first move with this classification for the specified player
        for (let i = 0; i < analysis.moves.length; i++) {
            const move = analysis.moves[i];
            
            // Check if this move belongs to the specified player
            // After white's move, it's black's turn (FEN contains ' b ')
            // After black's move, it's white's turn (FEN contains ' w ')
            const moveIsWhite = move.fen.includes(' b ');
            const moveIsBlack = move.fen.includes(' w ');
            
            const isTargetPlayer = (player === 'white' && moveIsWhite) || (player === 'black' && moveIsBlack);
            
            // Check if this move has the target classification
            if (isTargetPlayer && move.classification?.type === classificationType) {
                // Navigate to this move (mainline index is i + 1 since mainline[0] is root)
                const targetNode = chessUI.moveTree.mainline[i + 1];
                if (targetNode) {
                    // Navigate to the move
                    chessUI.moveNavigator.handleTreeNodeClick(targetNode);
                    
                    // Scroll to top
                    setTimeout(() => {
                        window.scrollTo({
                            top: 0,
                            behavior: 'smooth'
                        });
                    }, 100);
                    
                    return;
                }
            }
        }
        
        console.log(`No ${player} move found with classification: ${classificationType}`);
    }

    /**
     * Updates an existing game stats display
     * @param {jQuery|string} container - The container element or selector
     * @param {Object} analysis - The updated game analysis data
     * @param {string} whiteName - White player name
     * @param {string} blackName - Black player name
     */
    static update(container, analysis, whiteName = 'White', blackName = 'Black') {
        this.render(container, analysis, whiteName, blackName);
    }
} 