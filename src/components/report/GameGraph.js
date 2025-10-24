/**
 * Manages the rendering of the game evaluation graph
 */
export class GameGraph {
    static canvas = null;
    static ctx = null;
    static analysis = null;
    static hoverIndex = -1;
    static isHovering = false;
    static hoverX = 0;
    static hoverY = 0;
    static currentMove = null;
    static scaleFactor = 2;
    static initialized = false;
    static clickCallback = null;

    static get canvasElement() {
        if (!this.canvas) {
            this.canvas = document.getElementById('game-analysis-graph');
            this.ctx = this.canvas?.getContext('2d');
            this.setupEventListeners();
        }
        return this.canvas;
    }

    static setupEventListeners() {
        if (!this.canvas || this.initialized) return;
        
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseenter', () => { 
            this.isHovering = true; 
            this.canvas.style.cursor = 'pointer';
            this.render(); 
        });
        this.canvas.addEventListener('mouseleave', () => { 
            this.isHovering = false; 
            this.canvas.style.cursor = 'default';
            this.render(); 
        });
        this.canvas.addEventListener('click', this.handleClick.bind(this));
        this.canvas.addEventListener('touchstart', this.handleClick.bind(this));
        
        window.addEventListener('resize', () => this.render());
        this.initialized = true;
        this.render();
    }

    static setAnalysis(analysis) {
        this.analysis = analysis;
        this.render();
    }

    static setClickCallback(callback) {
        this.clickCallback = callback;
    }
    
    static handleMouseMove(event) {
        if (!this.analysis?.moves?.length) return;
        
        const rect = this.canvasElement.getBoundingClientRect();
        const x = (event.clientX - rect.left) * this.scaleFactor;
        const y = (event.clientY - rect.top) * this.scaleFactor;
        
        this.hoverX = x;
        this.hoverY = y;
        
        const width = this.canvasElement.width;
        const moves = this.analysis.moves;
        const total = moves.length;
        const increment = width / total;
        
        const moveIndex = Math.min(Math.max(0, Math.floor(x / increment)), total - 1);
        
        if (this.hoverIndex !== moveIndex) {
            this.hoverIndex = moveIndex;
            this.render();
        }
    }

    static handleClick(event) {
        if (!this.analysis?.moves?.length || !this.clickCallback) return;
        
        const rect = this.canvasElement.getBoundingClientRect();
        const x = (event.clientX - rect.left) * this.scaleFactor;
        
        const width = this.canvasElement.width;
        const moves = this.analysis.moves;
        const total = moves.length;
        const increment = width / total;
        
        const moveIndex = Math.min(Math.max(0, Math.floor(x / increment)), total - 1);
        const clickedMove = moves[moveIndex];
        
        if (clickedMove) {
            this.clickCallback(clickedMove);
        }
    }

    static updateCurrentMoveNumber(moveNumber) {
        this.currentMove = moveNumber;
        this.render();
    }

    static render() {
        if (!this.canvasElement || !this.ctx) return;

        const canvas = this.canvasElement;
        const ctx = this.ctx;
        
        const height = parseInt($(".game-graph").css('height')) * this.scaleFactor;
        const width = parseInt($(".game-graph").css('width')) * this.scaleFactor;

        canvas.width = canvas.clientWidth * this.scaleFactor;
        canvas.height = canvas.clientHeight * this.scaleFactor;

        // Draw background
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, width, height);

        if (!this.analysis || !this.analysis.moves || this.analysis.moves.length === 0) {
            // Draw loading background
            ctx.fillStyle = '#dddddd';
            ctx.fillRect(0, height/2, width, height);

            ctx.fillStyle = 'grey';
            ctx.fillRect(0, height / 2 - 1, width, 2);
            return;
        }

        const moves = this.analysis.moves;
        const total = moves.length;
        
        if (total > 0) {
            const increment = width / total;

            // Create smooth curve using Catmull-Rom spline approach
            ctx.beginPath();
            ctx.moveTo(-3, height);
            ctx.lineTo(0, height/2);
            
            if (total > 0) {
                // Collect all data points
                const points = [];
                for (let i = 0; i < total; i++) {
                    const move = moves[i];
                    const offset = increment * i;
                    const x = offset + 3;
                    const y = height / 100 * (move.graph);
                    points.push({ x, y });
                }
                
                // Draw smooth curve through all points
                if (points.length > 0) {
                    ctx.lineTo(points[0].x, points[0].y);
                    
                    for (let i = 1; i < points.length; i++) {
                        const current = points[i];
                        const previous = points[i - 1];
                        
                        // Calculate smooth control points using tension
                        const tension = 0.4; // Higher = more rounded
                        const cp1x = previous.x + (current.x - previous.x) * tension;
                        const cp1y = previous.y;
                        const cp2x = current.x - (current.x - previous.x) * tension;
                        const cp2y = current.y;
                        
                        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, current.x, current.y);
                    }
                    
                    // End the curve smoothly
                    const lastPoint = points[points.length - 1];
                    ctx.lineTo(increment * (total-1) + 50, lastPoint.y);
                }
            }
            
            ctx.lineTo(increment * (total-1) + 50, height);
            
            // Fill with white/gray
            ctx.fillStyle = '#dddddd';
            ctx.fill();
            
            // Draw the center line
            ctx.fillStyle = '#80808075';
            ctx.fillRect(0, height / 2 - 1, width, 2 * this.scaleFactor);

            // Always show classification dots for specific move types
            const importantClassifications = ['brilliant', 'great', 'mistake', 'miss', 'blunder'];
            
            for (let i = 0; i < total; i++) {
                const move = moves[i];
                if (importantClassifications.includes(move.classification.type)) {
                    const offset = increment * i;
                    const x = offset + 3;
                    const y = height / 100 * (move.graph);
                    
                    // Draw classification dot
                    ctx.fillStyle = move.classification.color;
                    ctx.beginPath();
                    ctx.arc(x, y, 3 * this.scaleFactor, 0, Math.PI * 2);
                    ctx.fill();
                    
                    // Add a subtle border for better visibility
                    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }
            }

            if (this.currentMove) {
                const move = moves[2 * this.currentMove - 2];
                if (!move) return;

                const offset = increment * this.currentMove * 2 - increment * 2;
                ctx.fillStyle = '#99999975';
                ctx.fillRect(offset - this.scaleFactor, 0, 2 * this.scaleFactor, height);
            
                const y = height / 100 * (move.graph);

                // Highlight current move dot (larger than classification dots)
                ctx.fillStyle = move.classification.color;
                ctx.beginPath();
                ctx.arc(offset, y, 5 * this.scaleFactor, 0, Math.PI * 2 * this.scaleFactor);
                ctx.fill();

            }

            // Draw hover effects
            if (this.isHovering && this.hoverIndex >= 0 && this.hoverIndex < total) {
                const move = moves[this.hoverIndex];

                const offset = increment * this.hoverIndex;
                const x = offset;
                const y = height/100 * (move.graph);

                // Vertical line
                ctx.fillStyle = '#99999975';
                ctx.fillRect(x - this.scaleFactor, 0, 2 * this.scaleFactor, height);
                
                // Highlight dot
                ctx.fillStyle = move.classification.color;

                ctx.beginPath();
                ctx.arc(x, y, 4 * this.scaleFactor, 0, Math.PI * 2 * this.scaleFactor);
                ctx.fill();

                this.drawEvaluationPopup(move, x, y - 22 * this.scaleFactor);
            }

        }
    }
    
    static drawEvaluationPopup(move, x, y) {
        const ctx = this.ctx;
        const popupWidth = 40 * this.scaleFactor;
        const popupHeight = 22 * this.scaleFactor;

        let evalText;
        const bestLine = move.lines.find(line => line.id === 1);
        if (bestLine) {
            const evalValue = bestLine.score / 100;
            const isMate = bestLine.type === 'mate';
            evalText = isMate ? `M${Math.abs(bestLine.score)}` : evalValue > 0 ? `+${evalValue.toFixed(2)}` : evalValue.toFixed(2);   
        } else {
            evalText = "0-1"
        }

        // Keep popup within canvas bounds
        const adjustedX = Math.min(Math.max(x - popupWidth/2, 10), this.canvasElement.width * this.scaleFactor - popupWidth - 10);
        const adjustedY = Math.min(Math.max(y - popupHeight/2, 50), this.canvasElement.height * this.scaleFactor - popupHeight - 10);

        // Draw popup background
        ctx.fillStyle = 'rgba(58, 58, 58, 0.95)';
        this.roundRect(ctx, adjustedX, adjustedY, popupWidth, popupHeight, 5, true);
    
        // Draw text
        ctx.fillStyle = 'white';
        ctx.font = `bold ${12 * this.scaleFactor}px Arial`;
        ctx.textAlign = 'center';
        ctx.fillText(`${evalText}`, adjustedX + popupWidth/2, adjustedY + 15 * this.scaleFactor);
    }
    
    static roundRect(ctx, x, y, width, height, radius, fill, stroke) {
        if (typeof radius === 'undefined') {
            radius = 5;
        }
        
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
        
        if (fill) {
            ctx.fill();
        }
        
        if (stroke) {
            ctx.stroke();
        }
    }
}