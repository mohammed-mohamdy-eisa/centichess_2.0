const engines = {
    'cloud': {
        name: "Cloud",
        type: "cloud",
        apiUrl: "https://lichess.org/api/cloud-eval",
        fallbackEngine: 'stockfish-17.1-nnue'
    },
    'stockfish-17.1-lite': {
        name: "Stockfish 17.1 Lite",
        // single-threaded fallback path (broadest compatibility)
        path: "./src/engines/stockfish/stockfish-17.1-lite-single-03e3232.js",
        // multi-threaded path (faster when WASM threads + COOP/COEP are enabled)
        multiPath: "./src/engines/stockfish/stockfish-17.1-lite-51f59da.js",
    },
    'stockfish-17.1-nnue': {
        name: "Stockfish 17.1 NNUE",
        path: "./src/engines/stockfish/stockfish-17.1-single-a496a04.js",
        // multi-threaded path (faster when WASM threads + COOP/COEP are enabled)
        multiPath: "./src/engines/stockfish/stockfish-17.1-8e4d048.js",
        // asm.js fallback for mobile devices (no WASM multi-part support)
        mobilePath: "./src/engines/stockfish/stockfish-17.1-asm-341ff22.js",
    },
    'stockfish-16-nnue': {
        name: "Stockfish 16 NNUE",
        path: "./src/engines/stockfish/stockfish-nnue-16.js",
    },
    'stockfish-16-lite': {
        name: "Stockfish 16 Lite",
        path: "./src/engines/stockfish/fallback-stockfish.js",
    },
    'stockfish-11': {
        name: "Stockfish 11",
        path: "./src/engines/stockfish/stockfish-11.js",
    }
}


// Runtime capability checks
function supportsWasmThreads() {
    try {
        // WebAssembly threads require SharedArrayBuffer and cross-origin isolation
        if (typeof SharedArrayBuffer === 'undefined') return false;
        // crossOriginIsolated is true when COOP/COEP headers are set
        if (typeof crossOriginIsolated !== 'undefined' && !crossOriginIsolated) return false;
        return true;
    } catch (_) {
        return false;
    }
}

// Detect mobile devices
function isMobileDevice() {
    try {
        const userAgent = navigator.userAgent || navigator.vendor || window.opera;
        const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i;
        return mobileRegex.test(userAgent);
    } catch (_) {
        return false;
    }
}


export class Engine {
    currentDepth = 0;
    multiPV = 3;
    busy = false;
    currentResolve = null;
    currentReject = null;
    isFallback = false;

    constructor({ engineType = 'stockfish-17.1-lite', threadCount = 0 } = {}) {
        this.engineType = engineType;
        this.engine = engines[engineType];
        
        // Auto-detect CPU count if threadCount is 0 or less
        if (threadCount <= 0) {
            // Use hardware concurrency, but cap at 4 for reasonable performance
            // Most browsers report logical cores (hyperthreading), so we limit it
            const detectedCPUs = navigator.hardwareConcurrency || 1;
            threadCount = Math.min(Math.max(1, Math.floor(detectedCPUs / 2)), 4);
            console.log(`Auto-detected ${detectedCPUs} logical cores, using ${threadCount} CPUs for engine`);
        }
        
        this.threadCount = threadCount;

        // Cloud engine doesn't need a worker
        if (this.engine.type === 'cloud') {
            console.log('Using Lichess Cloud evaluation');
            this.worker = null;
            this.fallbackEngine = null; // Will be initialized on first use if needed
            return;
        }

        // Determine worker path based on capabilities
        let workerPath = this.engine.path;
        
        // For 17.1 NNUE on mobile, use asm.js fallback (better compatibility)
        if (engineType === 'stockfish-17.1-nnue' && isMobileDevice() && this.engine.mobilePath) {
            console.log('Mobile device detected: Using asm.js for Stockfish 17.1 NNUE');
            workerPath = this.engine.mobilePath;
        }
        // For engines with multiPath support, use multi-threaded when threads > 1 and WASM threads are supported
        else if (
            (engineType === 'stockfish-17.1-lite' || engineType === 'stockfish-17.1-nnue') &&
            this.engine.multiPath &&
            threadCount > 1 &&
            supportsWasmThreads()
        ) {
            workerPath = this.engine.multiPath;
            console.log(`Using multi-threaded ${this.engine.name} with ${threadCount} CPUs`);
        } else if (threadCount > 1 && !supportsWasmThreads()) {
            console.warn('Multi-CPU mode requested but WebAssembly threads not supported. Falling back to single CPU.');
        }

        this.worker = new Worker(workerPath);
        
        this.worker.postMessage("uci");
        this.worker.postMessage(`setoption name MultiPV value ${this.multiPV}`);
        
        // Set thread count if using multi-threaded version
        if (threadCount > 1 && workerPath === this.engine.multiPath) {
            this.worker.postMessage(`setoption name Threads value ${threadCount}`);
        }
        
        // Setup global message handler for reuse
        this.worker.addEventListener("error", this.handleError.bind(this));
        
        // Add onerror handler directly (catches more errors than the event listener)
        this.worker.onerror = this.handleError.bind(this);
        
        // Add global error handling through window for worker errors
        window.addEventListener('unhandledrejection', (event) => {
            if (event.reason && event.reason.toString().includes('stockfish')) {
                console.log("Caught unhandled rejection:", event.reason);
                this.handleError(event.reason);
                event.preventDefault();
            }
        });
    }
    
    // Method to abort current evaluation
    abort() {
        if (this.worker) {
            this.worker.postMessage('stop');
        }
        if (this.currentResolve) {
            this.currentResolve([]);
            this.currentResolve = null;
            this.currentReject = null;
        }
        this.busy = false;
    }
    
    // Properly terminate worker
    terminate() {
        this.abort();
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        if (this.fallbackEngine) {
            this.fallbackEngine.terminate();
            this.fallbackEngine = null;
        }
    }
    
    handleError(err) {
        console.log("Engine error", err);
        if (this.currentReject) {
            this.currentReject(err);
            this.currentResolve = null;
            this.currentReject = null;
        }
        
        // Fallback to alternative engine if needed
        this.fallbackToAlternativeEngine();
        
        return true; // Prevent the error from propagating
    }
    
    fallbackToAlternativeEngine(fallen = 0) {
        if (fallen > 1) return;
        
        if (this.worker) {
            try {
                this.worker.terminate();
            } catch (err) {
                console.log("Error terminating worker:", err);
            }
        }
        
        try {
            console.log("Falling back to alternative engine");
            this.engine = engines['stockfish-16-lite'];
            this.worker = new Worker(this.engine.path);

            this.worker.postMessage("uci");
            this.worker.postMessage(`setoption name MultiPV value ${this.multiPV}`);
            this.worker.addEventListener("error", this.handleError.bind(this));
            this.worker.onerror = this.handleError.bind(this);
        } catch (err) {
            console.log("Error creating fallback worker:", err);
            
            // Try with a different engine if the fallback fails
            if (fallen < 1) {
                console.log("Trying with most basic engine");
                this.engine = engines['stockfish-11'];
                try {
                    this.worker = new Worker(this.engine.path);
                    this.worker.postMessage("uci");
                    this.worker.postMessage(`setoption name MultiPV value ${this.multiPV}`);
                    this.worker.addEventListener("error", this.handleError.bind(this));
                    this.worker.onerror = this.handleError.bind(this);
                } catch (e) {
                    console.log("All engine attempts failed");
                    this.worker = null;
                }
            } else {
                this.worker = null;
            }
        }
    }

    interpret(uciOutputLines, fen, targetDepth) {
        const outputs = uciOutputLines.filter(uciOutput => uciOutput.startsWith("info depth"));

        // Determine the highest achieved search depth in the available outputs.
        // This ensures we still return usable lines when movetime stops before targetDepth.
        let maxDepth = 0;
        for (const output of outputs) {
            const d = parseInt(output.match(/(?:depth )(\d+)/)?.[1] || "0");
            if (d > maxDepth) maxDepth = d;
        }

        const lines = [];
        for (const output of outputs) {
            // Extract depth, MultiPV line ID and evaluation from search message
            const id = parseInt(output.match(/(?:multipv )(\d+)/)?.[1]);
            const depth = parseInt(output.match(/(?:depth )(\d+)/)?.[1]);
            const uciMove = output.match(/(?: pv )(.+?)(?= |$)/)?.[1];

            // Only accept lines from the best achieved depth and avoid duplicates by multipv id
            if (!id || !depth || !uciMove || depth !== maxDepth || lines.some(line => line.id == id)) continue;

            // Invert score for black since stockfish is negamax instead of minimax
            const negamaxScore = parseInt(output.match(/(?:(?:cp )|(?:mate ))([\d-]+)/)?.[1] || "0");
            const score = fen.includes(" b ") ? -negamaxScore : negamaxScore;
            const type = output.includes(" cp ") ? "cp" : "mate";
            const pv = output.match(/.*pv\s+(.*)$/)?.[1].split(" ");

            lines.push({ id, uciMove, depth, score, type, pv });
        }

        return lines;
    }

    async evaluateCloud(fen, targetDepth, verbose = false, progressCallback = null) {
        try {
            // Reset fallback flag when attempting cloud evaluation
            this.isFallback = false;
            
            // Report initial progress
            if (progressCallback && typeof progressCallback === 'function') {
                progressCallback({ depth: 0, targetDepth: targetDepth, percent: 10 });
            }

            const params = new URLSearchParams({
                fen: fen,
                multiPv: this.multiPV.toString()
            });

            const response = await fetch(`${this.engine.apiUrl}?${params}`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Cloud API returned ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            
            if (verbose) {
                console.log('Cloud evaluation response:', data);
            }

            // Report progress
            if (progressCallback && typeof progressCallback === 'function') {
                progressCallback({ depth: targetDepth, targetDepth: targetDepth, percent: 100 });
            }

            // Transform cloud response to match local engine format
            const lines = [];
            if (data.pvs && Array.isArray(data.pvs)) {
                for (let i = 0; i < Math.min(data.pvs.length, this.multiPV); i++) {
                    const pv = data.pvs[i];
                    const moves = pv.moves ? pv.moves.split(' ') : [];
                    const uciMove = moves[0];
                    
                    if (!uciMove) continue;

                    // Handle both cp (centipawn) and mate scores
                    let score, type;
                    if (pv.mate !== undefined && pv.mate !== null) {
                        score = pv.mate;
                        type = 'mate';
                    } else {
                        score = pv.cp || 0;
                        type = 'cp';
                    }

                    lines.push({
                        id: i + 1,
                        uciMove: uciMove,
                        depth: data.depth || targetDepth,
                        score: score,
                        type: type,
                        pv: moves
                    });
                }
            }

            return lines;
        } catch (error) {
            console.warn('Cloud evaluation failed:', error.message, '- Falling back to Stockfish 17.1 NNUE (Fast preset)');
            // Fallback to local engine with fast preset settings
            return this.fallbackToLocalEngine(fen, targetDepth, verbose, progressCallback);
        }
    }

    async fallbackToLocalEngine(fen, targetDepth, verbose, progressCallback) {
        console.log('Falling back to Stockfish 17.1 NNUE with Fast preset');
        
        // Mark that we're using fallback
        this.isFallback = true;
        
        // Initialize fallback engine if not already done
        if (!this.fallbackEngine) {
            const fallbackType = this.engine.fallbackEngine || 'stockfish-17.1-nnue';
            // Use fast preset thread count (0 = auto) for fallback
            this.fallbackEngine = new Engine({ 
                engineType: fallbackType, 
                threadCount: 0
            });
        }

        // Use fast preset values for fallback: depth 9, time 31s (infinity)
        const fastDepth = 9;
        const fastTime = 31;
        
        return this.fallbackEngine.evaluate(fen, fastDepth, verbose, progressCallback, 0, fastTime);
    }

    /**
     * Get the current engine name, including fallback status
     */
    getEngineName() {
        if (this.isFallback && this.fallbackEngine) {
            return `${engines['stockfish-17.1-nnue'].name} (Fallback)`;
        }
        return this.engine.name;
    }

    async evaluate(fen, targetDepth, verbose = false, progressCallback = null, fallen = 0, maxMoveTime = null) {
        this.busy = true;
        
        // Reset current depth
        this.currentDepth = 0;
        
        // Use cloud evaluation if cloud engine is selected
        if (this.engine.type === 'cloud') {
            const result = await this.evaluateCloud(fen, targetDepth, verbose, progressCallback);
            this.busy = false;
            return result;
        }
        
        if (!this.worker) {
            try {
                // Recompute a sensible worker path for this engine/context
                let workerPath = this.engine.path;

                // Prefer asm.js on mobile for NNUE if available
                if (this.engineType === 'stockfish-17.1-nnue' && (function () {
                    try {
                        const ua = navigator.userAgent || navigator.vendor || window.opera;
                        return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i.test(ua);
                    } catch (_) { return false; }
                })() && this.engine.mobilePath) {
                    workerPath = this.engine.mobilePath;
                } else if (
                    (this.engineType === 'stockfish-17.1-lite' || this.engineType === 'stockfish-17.1-nnue') &&
                    this.engine.multiPath &&
                    this.threadCount > 1 &&
                    (function () {
                        try {
                            if (typeof SharedArrayBuffer === 'undefined') return false;
                            if (typeof crossOriginIsolated !== 'undefined' && !crossOriginIsolated) return false;
                            return true;
                        } catch (_) { return false; }
                    })()
                ) {
                    workerPath = this.engine.multiPath;
                }

                this.worker = new Worker(workerPath);
                this.worker.postMessage("uci");
                this.worker.postMessage(`setoption name MultiPV value ${this.multiPV}`);
                if (this.threadCount > 1 && workerPath === this.engine.multiPath) {
                    this.worker.postMessage(`setoption name Threads value ${this.threadCount}`);
                }
                this.worker.addEventListener("error", this.handleError.bind(this));
                this.worker.onerror = this.handleError.bind(this);
            } catch (err) {
                console.log("Error creating worker:", err);
                this.fallbackToAlternativeEngine(fallen);
                return this.evaluate(fen, targetDepth, verbose, progressCallback, fallen + 1, maxMoveTime);
            }
        }
        
        try {
            this.worker.postMessage(`position fen ${fen}`);
            
            // Use both depth and time limits when time is specified, otherwise just depth
            if (maxMoveTime && maxMoveTime < 31) {
                const timeInMs = maxMoveTime * 1000;
                this.worker.postMessage(`go depth ${targetDepth} movetime ${timeInMs}`);
            } else {
                this.worker.postMessage(`go depth ${targetDepth}`);
            }
        } catch (err) {
            console.log("Error sending commands to worker:", err);
            this.fallbackToAlternativeEngine(fallen);
            return this.evaluate(fen, targetDepth, verbose, progressCallback, fallen + 1, maxMoveTime);
        }

        const messages = [];

        return new Promise((resolve, reject) => {
            this.currentResolve = resolve;
            this.currentReject = reject;
            
            const messageHandler = (event) => {
                try {
                    const message = event.data;
                    messages.unshift(message);

                    if (verbose) console.log(message);

                    let latestDepth = parseInt(message.match(/(?:depth )(\d+)/)?.[1] || "0");
                    if (latestDepth > 0) {
                        this.currentDepth = Math.max(latestDepth, this.currentDepth);
                        
                        // Report progress based on current depth compared to target depth
                        if (progressCallback && typeof progressCallback === 'function') {
                            const progressPercent = Math.round((this.currentDepth / targetDepth) * 100);
                            progressCallback({
                                depth: this.currentDepth,
                                targetDepth: targetDepth,
                                percent: progressPercent
                            });
                        }
                    }

                    // Best move or checkmate log indicates end of search
                    if (message.startsWith("bestmove") || message.includes("depth 0")) {            
                        const lines = this.interpret(messages, fen, targetDepth);
                        
                        // Report 100% completion
                        if (progressCallback && typeof progressCallback === 'function') {
                            progressCallback({
                                depth: targetDepth,
                                targetDepth: targetDepth,
                                percent: 100
                            });
                        }
                        
                        this.worker.removeEventListener("message", messageHandler);
                        this.busy = false;
                        this.currentResolve = null;
                        this.currentReject = null;
                        resolve(lines);
                    }
                } catch (err) {
                    console.log("Error handling message:", err);
                    this.worker.removeEventListener("message", messageHandler);
                    this.handleError(err);
                }
            };

            this.worker.addEventListener("message", messageHandler, { once: false });
            
            // Add safety timeout in case engine gets stuck
            setTimeout(() => {
                if (this.busy && this.currentResolve === resolve) {
                    console.warn("Engine evaluation timed out, falling back");
                    this.worker.removeEventListener("message", messageHandler);
                    
                    if (fallen < 2) {
                        // Try with fallback engine
                        this.fallbackToAlternativeEngine(fallen);
                        this.evaluate(fen, targetDepth, verbose, progressCallback, fallen + 1, maxMoveTime)
                            .then(resolve)
                            .catch(reject);
                    } else {
                        // Give up after fallback attempt
                        this.busy = false;
                        this.currentResolve = null;
                        this.currentReject = null;
                        resolve([]);

                        console.log("Gave up")
                    }
                }
            }, 30000 * targetDepth); // timeout depends on depth
        });
    }
}