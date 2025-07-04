/**
 * Clock utility class for displaying chess clocks from PGN annotations
 */
export class Clock {
    /**
     * Updates the clock display for both players
     * @param {Object} node - The current move tree node
     * @param {boolean} isFlipped - Whether the board is flipped
     */
    static updateClocks(node, isFlipped = false) {
        // Get clock data for current position
        const whiteTime = Clock.getClockTime(node, 'white');
        const blackTime = Clock.getClockTime(node, 'black');
        
        // Update clock displays
        Clock.displayClock('#white-clock .clock-time', whiteTime);
        Clock.displayClock('#black-clock .clock-time', blackTime);
        
        // Handle flipped board - clocks should stay with their respective players
        // The CSS handles the visual positioning
    }
    
    /**
     * Gets the clock time for a specific color from the node
     * @param {Object} node - The move tree node
     * @param {string} color - 'white' or 'black'
     * @returns {string|null} The clock time string or null if not available
     */
    static getClockTime(node, color) {
        // Check if this node has clock data
        if (node.clock) {
            // Determine which player's clock this represents based on the move
            const isWhiteMove = node.move && node.move.color === 'w';
            const isBlackMove = node.move && node.move.color === 'b';
            
            if ((color === 'white' && isWhiteMove) || (color === 'black' && isBlackMove)) {
                return node.clock;
            }
        }
        
        return null;
    }
    
    /**
     * Displays the clock time in the specified element
     * @param {string} selector - CSS selector for the clock element
     * @param {string|null} timeString - The time string to display
     * @param {boolean} isActive - Whether this is the active player's clock
     */
    static displayClock(selector, timeString, isActive = false) {
        const element = document.querySelector(selector);
        if (!element) return;
        
        // Remove all clock-related classes
        element.classList.remove('low-time', 'active');
        
        if (timeString) {
            const formattedTime = Clock.formatClockTime(timeString);
            element.textContent = formattedTime;
            
            // Add low-time class if time is less than 10 seconds
            const seconds = Clock.parseTimeToSeconds(timeString);
            if (seconds !== null && seconds < 10) {
                element.classList.add('low-time');
            }
        } else {
            element.textContent = '--:--';
        }
        
        // Add active class if this is the active player's clock
        if (isActive) {
            element.classList.add('active');
        }
    }
    
    /**
     * Formats a clock time string for display
     * @param {string} timeString - Raw time string from PGN (e.g., "0:03:00.9")
     * @returns {string} Formatted time string (e.g., "3:00")
     */
    static formatClockTime(timeString) {
        // Handle different time formats
        if (timeString.includes(':')) {
            const parts = timeString.split(':');
            if (parts.length >= 3) {
                // Format: H:MM:SS.s or H:MM:SS
                const hours = parseInt(parts[0]);
                const minutes = parseInt(parts[1]);
                const seconds = parseInt(parts[2].split('.')[0]);
                
                if (hours > 0) {
                    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                } else {
                    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
                }
            } else if (parts.length === 2) {
                // Format: MM:SS
                const minutes = parseInt(parts[0]);
                const seconds = parseInt(parts[1].split('.')[0]);
                return `${minutes}:${seconds.toString().padStart(2, '0')}`;
            }
        }
        
        // Fallback - return as is
        return timeString;
    }
    
    /**
     * Parses a time string to total seconds
     * @param {string} timeString - Time string to parse
     * @returns {number|null} Total seconds or null if parsing fails
     */
    static parseTimeToSeconds(timeString) {
        try {
            if (timeString.includes(':')) {
                const parts = timeString.split(':');
                if (parts.length >= 3) {
                    // Format: H:MM:SS.s
                    const hours = parseInt(parts[0]);
                    const minutes = parseInt(parts[1]);
                    const seconds = parseInt(parts[2].split('.')[0]);
                    return hours * 3600 + minutes * 60 + seconds;
                } else if (parts.length === 2) {
                    // Format: MM:SS
                    const minutes = parseInt(parts[0]);
                    const seconds = parseInt(parts[1].split('.')[0]);
                    return minutes * 60 + seconds;
                }
            }
        } catch (e) {
            console.warn('Failed to parse time string:', timeString);
        }
        
        return null;
    }
    
    /**
     * Resets clock display to default state
     */
    static resetClocks() {
        Clock.displayClock('#white-clock .clock-time', null, false);
        Clock.displayClock('#black-clock .clock-time', null, false);
    }
    
    /**
     * Updates clocks based on the current move tree position
     * @param {Object} moveTree - The move tree instance
     * @param {boolean} isFlipped - Whether the board is flipped
     * @param {string} pgn - Optional PGN string for TimeControl fallback
     */
    static updateFromMoveTree(moveTree, isFlipped = false, pgn = null) {
        if (!moveTree || !moveTree.currentNode) {
            Clock.resetClocks();
            return;
        }
        
        const currentNode = moveTree.currentNode;
        
        // Get initial time from TimeControl or first move
        const getInitialTime = () => {
            // First try to get from TimeControl
            if (pgn) {
                const timeControlTime = Clock.getTimeControlFromPGN(pgn);
                if (timeControlTime) return timeControlTime;
            }
            
            // Fallback to first move's clock
            if (moveTree.mainline.length > 1) {
                const firstMove = moveTree.mainline[1];
                if (firstMove.clock) {
                    return firstMove.clock;
                }
            }
            return null;
        };
        
        // For the starting position, show initial time for both players
        if (currentNode.id === 'root') {
            const initialTime = getInitialTime();
            Clock.displayClock('#white-clock .clock-time', initialTime, true); // White to move initially
            Clock.displayClock('#black-clock .clock-time', initialTime, false);
            return;
        }
        
        // Find the most recent clock times for both players
        let whiteTime = null;
        let blackTime = null;
        let nextToMove = 'w'; // Default to white
        
        // Walk backwards through the mainline to find the most recent times
        const nodeIndex = moveTree.getNodeIndex(currentNode);
        if (nodeIndex !== -1) {
            // Determine whose turn it is based on current position
            if (currentNode.move) {
                nextToMove = currentNode.move.color === 'w' ? 'b' : 'w';
            }
            
            // Check current and previous moves for clock data
            for (let i = nodeIndex; i >= 1; i--) {
                const node = moveTree.mainline[i];
                if (node.clock && node.move) {
                    if (node.move.color === 'w' && !whiteTime) {
                        whiteTime = node.clock;
                    } else if (node.move.color === 'b' && !blackTime) {
                        blackTime = node.clock;
                    }
                }
                
                // Break if we have both times
                if (whiteTime && blackTime) break;
            }
        }
        
        // If we don't have clock data, use initial time
        const initialTime = getInitialTime();
        if (!whiteTime) whiteTime = initialTime;
        if (!blackTime) blackTime = initialTime;
        
        // Update displays with active clock highlighting
        const isWhiteActive = nextToMove === 'w';
        Clock.displayClock('#white-clock .clock-time', whiteTime, isWhiteActive);
        Clock.displayClock('#black-clock .clock-time', blackTime, !isWhiteActive);
    }
    
    /**
     * Sets both clocks to initial starting time before analysis begins
     * @param {Object} moveTree - The move tree instance
     * @param {string} pgn - The PGN string to extract TimeControl from
     */
    static setInitialClocks(moveTree, pgn) {
        if (!moveTree) {
            Clock.resetClocks();
            return;
        }
        
        // Get initial time from PGN TimeControl header
        const initialTime = Clock.getTimeControlFromPGN(pgn);
        
        // Set both clocks to initial time, with white active
        Clock.displayClock('#white-clock .clock-time', initialTime, true);
        Clock.displayClock('#black-clock .clock-time', initialTime, false);
    }
    
    /**
     * Extracts TimeControl value from PGN header and converts to display format
     * @param {string} pgn - The PGN string
     * @returns {string|null} Formatted time string or null if not found
     */
    static getTimeControlFromPGN(pgn) {
        if (!pgn) return null;
        
        // Extract TimeControl header value
        const timeControlMatch = pgn.match(/\[TimeControl\s+"([^"]+)"\]/i);
        if (!timeControlMatch) return null;
        
        const timeControlValue = timeControlMatch[1];
        
        // Handle different TimeControl formats
        if (timeControlValue === '-') {
            // Unlimited time
            return null;
        }
        
        // Handle formats like "600" (seconds), "600+5" (seconds + increment), "1800+30"
        const parts = timeControlValue.split('+');
        const baseTimeSeconds = parseInt(parts[0]);
        
        if (isNaN(baseTimeSeconds)) return null;
        
        // Convert seconds to time format
        return Clock.secondsToTimeString(baseTimeSeconds);
    }
    
    /**
     * Converts seconds to time string format
     * @param {number} seconds - Total seconds
     * @returns {string} Formatted time string (e.g., "10:00", "1:30:00")
     */
    static secondsToTimeString(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = seconds % 60;
        
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
        } else {
            return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
        }
    }
} 