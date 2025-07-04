import { Platform } from "./GameLoader.js";

export const TimeControl = {
    ALL: 'all',
    BULLET: 'bullet',
    BLITZ: 'blitz',
    RAPID: 'rapid'
}

export const Rating = {
    ALL: 'all',
    RATED: 'rated',
    CASUAL: 'casual'
}

export const Result = {
    ALL: 'all',
    DRAW: 'draw',
    WIN: 'win',
    LOSS: 'loss'
}

export class GamesList {
    constructor(containerSelector = '.games-list') {
        this.$container = $(containerSelector);
        this.$searchButton = $('#search-btn');
        this.$filterButton = $('#filter');
        this.$searchField = $('.search-field');
        this.$dropdownContent = $('.dropdown-content');
        
        this.isLoading = false;
        this.cookieNames = {
            [Platform.CHESSCOM]: 'centichess_last_user_chesscom',
            [Platform.LICHESS]: 'centichess_last_user_lichess',
            [Platform.PGN]: 'centichess_last_pgn'
        };
        this.currentPlatform = Platform.CHESSCOM;

        this.allGames = [];
        this.displayedGames = [];
        this.lastFetchedTimestamp = null; // For Lichess pagination

        this.currentUsername = '';
        this.gamesPerPage = 15;
        this.loadMoreSize = 30;

        this.profilePictureCache = new Map();
        this.activeFilters = {
            result: Result.ALL,
            timeControl: TimeControl.ALL,
            rated: Rating.ALL
        };
        
        this.init();
    }

    init() {
        this.bindEvents();
        this.bindPlatformEvents();
        this.initializeFilterDropdown();
        this.loadLastSearchedUser();
    }

    toggleInputElements() {
        const $searchBar = $('.search-bar');
        const $pgnContainer = $('.pgn-input-container');
        
        if (this.currentPlatform === Platform.PGN) {
            // Hide search bar and show PGN input
            $searchBar.hide();
            if ($pgnContainer.length === 0) {
                this.createPGNInputElements();
            } else {
                $pgnContainer.show();
            }
        } else {
            // Show search bar and hide PGN input
            $searchBar.show();
            $pgnContainer.hide();
        }
    }

    createPGNInputElements() {
        const $selectionContent = $('.selection-content');
        const pgnInputHtml = `
            <div class="pgn-input-container">
                <div class="pgn-input-section">
                    <h3>Paste PGN</h3>
                    <textarea id="pgn-textarea" class="pgn-textarea" placeholder="Paste your PGN here..."></textarea>
                    <button class="pgn-load-button">Load PGN</button>
                </div>
                <div class="pgn-upload-section">
                    <h3>Upload PGN File</h3>
                    <input type="file" class="pgn-file-input" accept=".pgn" style="display: none;">
                    <button class="pgn-upload-button">Choose PGN File</button>
                    <span class="pgn-file-name"></span>
                </div>
            </div>
        `;
        
        $selectionContent.prepend(pgnInputHtml);
        this.bindPGNEvents();
    }

    bindPGNEvents() {
        const $pgnContainer = $('.pgn-input-container');
        
        // Handle paste PGN
        $pgnContainer.find('.pgn-load-button').on('click', () => {
            const pgnText = $('#pgn-textarea').val().trim();
            if (pgnText) {
                this.loadPGNGame(pgnText);
            }
        });
        
        // Handle file upload
        $pgnContainer.find('.pgn-upload-button').on('click', () => {
            $pgnContainer.find('.pgn-file-input').click();
        });
        
        $pgnContainer.find('.pgn-file-input').on('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                $pgnContainer.find('.pgn-file-name').text(file.name);
                this.loadPGNFile(file);
            }
        });
        
        // Handle Enter key in textarea
        $('#pgn-textarea').on('keypress', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                const pgnText = $(e.target).val().trim();
                if (pgnText) {
                    this.loadPGNGame(pgnText);
                }
            }
        });
    }

    loadPGNFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const pgnText = e.target.result;
            this.loadPGNGame(pgnText);
        };
        reader.readAsText(file);
    }

    loadPGNGame(pgnText) {
        try {
            this.setCookie(this.cookieNames[Platform.PGN], pgnText);
            const gameData = this.processPGNGame(pgnText);
            this.allGames = [gameData];
            // For PGN games, use white player as the username since result is from white's perspective
            this.currentUsername = gameData.white;
            this.displayedGames = [];
            this.filterAndRenderGames(true);
        } catch (error) {
            console.error('Error loading PGN:', error);
            this.showStatus('error', 'Invalid PGN format. Please check your PGN and try again.');
        }
    }

    processPGNGame(pgnText) {
        const pgnData = this.parsePGN(pgnText);
        
        // Generate a unique game ID based on content
        const gameId = this.generatePGNGameId(pgnText);
        
        // Extract player names
        const white = pgnData.white || 'White';
        const black = pgnData.black || 'Black';
        
        // Extract ratings
        const whiteRating = parseInt(pgnData.whiteelo) || 0;
        const blackRating = parseInt(pgnData.blackelo) || 0;
        
        // Determine result - for PGN games, use the actual result from white's perspective
        let result = 'draw';
        if (pgnData.result === '1-0') result = 'win';
        else if (pgnData.result === '0-1') result = 'loss';
        else if (pgnData.result === '1/2-1/2') result = 'draw';
        
        // Get time control
        const timeControl = this.getTimeControlCategory(pgnData);
        
        // Determine if it's rated (default to true for PGN)
        const rated = pgnData.rated !== 'false';
        
        // Use current timestamp for end time
        const endTime = Math.floor(Date.now() / 1000);
        
        return {
            gameId,
            white,
            whiteRating,
            black,
            blackRating,
            result,
            time: 0, // PGN doesn't typically have time info
            timeControl,
            accuracy: '-', // PGN doesn't have accuracy info
            isWhite: true, // Default to white perspective
            rated,
            endTime,
            platform: Platform.PGN,
            pgn: pgnText
        };
    }

    generatePGNGameId(pgnText) {
        // Generate a simple hash of the PGN text
        let hash = 0;
        for (let i = 0; i < pgnText.length; i++) {
            const char = pgnText.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(36);
    }

    setCookie(name, value, days = 30) {
        try {
            const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
            document.cookie = `${name}=${value};expires=${expires};path=/`;
        } catch {
            localStorage.setItem(name, value);
        }
    }

    getCookie(name) {
        try {
            return document.cookie.match(new RegExp(`${name}=([^;]+)`))?.[1] || localStorage.getItem(name);
        } catch {
            return localStorage.getItem(name);
        }
    }

    loadLastSearchedUser() {
        if (this.currentPlatform === Platform.PGN) {
            const lastPGN = this.getCookie(this.cookieNames[Platform.PGN]);
            if (lastPGN) {
                // Load the last PGN game
                const $pgnTextarea = $('#pgn-textarea');
                if ($pgnTextarea.length) {
                    $pgnTextarea.val(lastPGN);
                    this.loadPGNGame(lastPGN);
                }
            }
        } else {
            const lastUser = this.getCookie(this.cookieNames[this.currentPlatform]);
            if (lastUser && this.$searchField.length) {
                this.$searchField.val(lastUser);
                this.$container.empty();
                this.loadGamesForUser(lastUser);
            }
        }
    }

    bindEvents() {
        this.$searchButton.on('click', this.handleSearch.bind(this));
        this.$searchField.on('keypress', e => {
            if (e.key === 'Enter') this.handleSearch();
        });

        this.$filterButton.on('click', e => {
            e.stopPropagation();
            this.toggleFilterDropdown();
        });

        $(document).on('click', e => {
            const $dropdown = this.$filterButton.closest('.dropdown');
            if (!$dropdown.is(e.target) && !$dropdown.has(e.target).length) {
                $dropdown.removeClass('active');
            }
        });
    }

    bindPlatformEvents() {
        const platformTags = document.querySelectorAll('.three-tag-layout .tag');
        platformTags.forEach((tag, index) => {
            tag.addEventListener('click', () => {
                // Remove selected class from all tags
                platformTags.forEach(t => t.classList.remove('selected'));

                tag.classList.add('selected');
                
                // Update selected platform
                if (index === 0) {
                    this.currentPlatform = Platform.CHESSCOM;
                } else if (index === 1) {
                    this.currentPlatform = Platform.LICHESS;
                } else if (index === 2) {
                    this.currentPlatform = Platform.PGN;
                }
                
                // Clear current games and search field
                this.allGames = [];
                this.displayedGames = [];
                this.lastFetchedTimestamp = null;
                this.$container.empty();
                this.$searchField.val('');
                
                // Show/hide appropriate input elements
                this.toggleInputElements();
                
                // Load last searched user for the new platform
                this.loadLastSearchedUser();
            });
        });
    }

    handleSearch() {
        if (this.isLoading) return;
        
        const username = this.$searchField.val().trim();
        if (!username) return;

        this.setCookie(this.cookieNames[this.currentPlatform], username);
        this.loadGamesForUser(username);
    }

    async loadGamesForUser(username) {
        this.isLoading = true;
        this.showStatus('loading', 'Loading games...', `
            <svg class="loading-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
                <path d="M463.5 224l8.5 0c13.3 0 24-10.7 24-24l0-128c0-9.7-5.8-18.5-14.8-22.2s-19.3-1.7-26.2 5.2L413.4 96.6c-87.6-86.5-228.7-86.2-315.8 1c-87.5 87.5-87.5 229.3 0 316.8s229.3 87.5 316.8 0c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0c-62.5 62.5-163.8 62.5-226.3 0s-62.5-163.8 0-226.3c62.2-62.2 162.7-62.5 225.3-1L327 183c-6.9 6.9-8.9 17.2-5.2 26.2s12.5 14.8 22.2 14.8l119.5 0z" fill="currentColor"/>
            </svg>
        `);

        try {
            const games = await this.fetchAllGames(username);
            this.allGames = games.map(game => this.processGameData(game, username));
            this.currentUsername = username;
            this.displayedGames = [];
            this.filterAndRenderGames(true);
        } catch (error) {
            console.error('Error loading games:', error);
            this.showStatus('error', 'Error loading games. Please try again.')
        } finally {
            this.isLoading = false;
        }
    }

    showStatus(type, message = '', icon = '') {
        const platformName = this.currentPlatform === Platform.LICHESS ? 'Lichess' : 'Chess.com';
        if (type === 'loading') {
            message = `Loading ${platformName} games...`;
        }
        
        this.$container.html(`
            <li class="game-item ${type}-item">
                <div class="${type}-container">
                    ${icon}
                    <span class="${type}-text">${message}</span>
                </div>
            </li>
        `);
    }

    async fetchAllGames(username) {
        if (this.currentPlatform === Platform.LICHESS) {
            return this.fetchLichessGames(username);
        }
        
        // Chess.com API
        const archivesResponse = await fetch(`https://api.chess.com/pub/player/${username}/games/archives`);
        if (!archivesResponse.ok) throw new Error(`Failed to fetch archives: ${archivesResponse.status}`);
        
        const { archives = [] } = await archivesResponse.json();
        if (!archives.length) return [];
        
        const archivePromises = archives.sort().reverse().map(async url => {
            try {
                const response = await fetch(url);
                return response.ok ? (await response.json()).games || [] : [];
            } catch {
                return [];
            }
        });
        
        const allGames = (await Promise.all(archivePromises)).flat();
        return allGames.sort((a, b) => new Date(b.end_time) - new Date(a.end_time));
    }

    async fetchLichessGames(username) {
        const maxGames = this.gamesPerPage;
        const since = this.lastFetchedTimestamp || undefined;
        
        const params = new URLSearchParams({
            max: maxGames,
            pgnInJson: true,
            clocks: true,
            evals: true,
            opening: true
        });
        if (since) params.append('until', since);

        try {
            const response = await fetch(`https://lichess.org/api/games/user/${username}?${params}`, {
                headers: { 'Accept': 'application/x-ndjson' }
            });

            if (!response.ok) throw new Error(`Failed to fetch Lichess games: ${response.status}`);

            const text = await response.text();
            const games = text.trim().split('\n').map(line => JSON.parse(line));
            
            if (games.length > 0) {
                const lastGame = games[games.length - 1];
                this.lastFetchedTimestamp = new Date(lastGame.createdAt).getTime();
            }

            return games;
        } catch (error) {
            console.error('Error fetching Lichess games:', error);
            throw error;
        }
    }

    parsePGN(pgn) {
        const data = {};
        const matches = pgn.matchAll(/\[(\w+)\s+"([^"]+)"\]/g);
        for (const [, key, value] of matches) {
            data[key.toLowerCase()] = value;
        }
        return data;
    }

    getTimeControlCategory(pgnData) {
        const minutes = parseInt(pgnData.timecontrol?.split('+')[0] || 600) / 60;
        
        if (minutes < 3) return 'bullet';
        if (minutes < 10) return 'blitz';
        return 'rapid';
    }

    processGameData(game, username) {
        if (this.currentPlatform === Platform.LICHESS) {
            return this.processLichessGame(game, username);
        }

        // Process Chess.com game
        const pgnData = this.parsePGN(game.pgn);
        const isWhite = pgnData.white.toLowerCase() === username.toLowerCase();
        
        let result = 'draw';
        if (pgnData.result === '1-0') result = isWhite ? 'win' : 'loss';
        else if (pgnData.result === '0-1') result = isWhite ? 'loss' : 'win';
        
        const gameTime = parseInt(pgnData.timecontrol?.split('+')[0] || 0) * 1000;
        const accuracy = game.accuracies?.[isWhite ? 'white' : 'black'];

        return {
            gameId: game.url.split('/').pop(),
            white: pgnData.white,
            whiteRating: parseInt(pgnData.whiteelo) || 0,
            black: pgnData.black,
            blackRating: parseInt(pgnData.blackelo) || 0,
            result,
            time: gameTime,
            timeControl: this.getTimeControlCategory(pgnData),
            accuracy: accuracy ? accuracy.toFixed(1) : '-',
            isWhite,
            rated: game.rated,
            endTime: game.end_time,
            platform: Platform.CHESSCOM
        };
    }

    processLichessGame(game, username) {
        const isWhite = game.players.white.user?.name?.toLowerCase() === username.toLowerCase();
        
        let result = 'draw';
        if (game.winner === 'white') result = isWhite ? 'win' : 'loss';
        else if (game.winner === 'black') result = isWhite ? 'loss' : 'win';

        const initialTime = game.clock?.initial || 0;
        const increment = game.clock?.increment || 0;
        const timeControl = this.getLichessTimeControl(initialTime, increment);

        return {
            gameId: game.id,
            white: game.players.white.user?.name || 'Anonymous',
            whiteRating: game.players.white.rating || 0,
            black: game.players.black.user?.name || 'Anonymous',
            blackRating: game.players.black.rating || 0,
            result,
            time: initialTime * 1000,
            timeControl,
            accuracy: game.players[isWhite ? 'white' : 'black'].analysis?.accuracy?.toFixed(1) || '-',
            isWhite,
            rated: game.rated,
            endTime: new Date(game.lastMoveAt || game.createdAt).getTime() / 1000,
            platform: Platform.LICHESS
        };
    }

    getLichessTimeControl(initial, increment) {
        const totalMinutes = (initial + increment * 40) / 60;
        if (totalMinutes < 3) return TimeControl.BULLET;
        if (totalMinutes < 10) return TimeControl.BLITZ;
        return TimeControl.RAPID;
    }

    initializeFilterDropdown() {
        if (!this.$dropdownContent.length) return;

        this.$dropdownContent.html(`
            <div class="filter-section">
                <h4>Result</h4>
                ${this.createRadioGroup('result', [
                    [Result.ALL, 'All', true],
                    [Result.WIN, 'Wins'],
                    [Result.LOSS, 'Losses'],
                    [Result.DRAW, 'Draws']
                ])}
            </div>
            <div class="filter-section">
                <h4>Time Control</h4>
                ${this.createRadioGroup('timeControl', [
                    [TimeControl.ALL, 'All', true],
                    [TimeControl.BULLET, 'Bullet (< 3 min)'], 
                    [TimeControl.BLITZ, 'Blitz (3-10 min)'],
                    [TimeControl.RAPID, 'Rapid (10+ min)']
                ])}
            </div>
            <div class="filter-section">
                <h4>Game Type</h4>
                ${this.createRadioGroup('rated', [
                    [Rating.ALL, 'All', true],
                    [Rating.RATED, 'Rated'],
                    [Rating.CASUAL, 'Casual']
                ])}
            </div>
            <div class="filter-actions">
                <button class="apply-filters">Apply</button>
                <button class="reset-filters">Reset</button>
            </div>
        `);

        this.$dropdownContent.find('.apply-filters').on('click', () => {
            this.applyFilters();
            this.toggleFilterDropdown();
        });

        this.$dropdownContent.find('.reset-filters').on('click', () => {
            this.resetFilters();
        });
    }

    createRadioGroup(name, options) {
        return options.map(([value, label, checked = false]) => 
            `<label><input type="radio" name="${name}" value="${value}" ${checked ? 'checked' : ''}> ${label}</label>`
        ).join('');
    }

    toggleFilterDropdown() {
        this.$filterButton.closest('.dropdown').toggleClass('active');
    }

    applyFilters() {
        const getCheckedValue = name => this.$dropdownContent.find(`input[name="${name}"]:checked`).val() || 'all';
        
        this.activeFilters = {
            result: getCheckedValue('result'),
            timeControl: getCheckedValue('timeControl'),
            rated: getCheckedValue('rated')
        };

        this.displayedGames = [];
        this.filterAndRenderGames(true);
    }

    resetFilters() {
        this.$dropdownContent.find('input[value="all"]').prop('checked', true);
        this.activeFilters = { result: 'all', timeControl: 'all', rated: 'all' };
        this.displayedGames = [];
        this.filterAndRenderGames(true);
    }

    async filterAndRenderGames(isInitialLoad = false) {
        if (!this.allGames.length) return;

        const filteredGames = this.allGames.filter(game => this.matchesFilters(game));
        
        if (isInitialLoad) {
            this.displayedGames = filteredGames.slice(0, this.gamesPerPage);
            this.renderGames(this.displayedGames, filteredGames.length);
        } else {
            if (this.currentPlatform === Platform.LICHESS) {
                // For Lichess, check if we need to fetch more games
                if (this.displayedGames.length >= filteredGames.length) {
                    const newGames = await this.fetchLichessGames(this.currentUsername);
                    if (newGames.length > 0) {
                        const processedGames = newGames.map(game => this.processLichessGame(game, this.currentUsername));
                        this.allGames = [...this.allGames, ...processedGames];
                        return this.filterAndRenderGames(false);
                    }
                }
            }
            
            const currentCount = this.displayedGames.length;
            const nextBatch = filteredGames.slice(currentCount, currentCount + this.loadMoreSize);
            this.displayedGames = [...this.displayedGames, ...nextBatch];
            this.appendGames(nextBatch, filteredGames.length);
        }
    }

    matchesFilters(game) {
        if (this.activeFilters.result !== Result.ALL && game.result !== this.activeFilters.result) {
            return false;
        }

        if (this.activeFilters.timeControl !== TimeControl.ALL) {
            if (game.timeControl !== this.activeFilters.timeControl) return false;
        }

        if (this.activeFilters.rated !== Rating.ALL) {
            if ((this.activeFilters.rated === Rating.RATED) !== game.rated) return false;
        }

        return true;
    }

    renderGames(games, totalCount) {
        if (!games.length) {
            return this.showStatus('error', 'No games match the selected filters');
        }
        
        this.$container.html(games.map(game => this.createGameItem(game)).join(''));
        this.addLoadMoreButton(games.length, totalCount);
        this.loadProfilePictures();
        this.bindPGNGameEvents();
    }

    appendGames(games, totalCount) {
        if (!games.length) return;
        
        this.$container.find('.load-more-container').remove();
        
        const gameItems = games.map(game => this.createGameItem(game)).join('');
        
        this.$container.append(gameItems);
        this.addLoadMoreButton(this.displayedGames.length, totalCount);
        this.loadProfilePictures();
        this.bindPGNGameEvents();
    }

    addLoadMoreButton(currentCount, totalCount) {
        this.$container.find('.load-more-container').remove();
        
        let buttonHtml = '';
        if (this.currentPlatform === Platform.CHESSCOM) {
            if (currentCount < totalCount) {
                buttonHtml = `<li class="load-more-container">
                    <button class="load-more-button">Load More Games (${currentCount}/${totalCount})</button>
                </li>`;
            } else if (totalCount > 0) {
                buttonHtml = `<li class="load-more-container">
                    <div class="all-loaded-message">All ${totalCount} games loaded</div>
                </li>`;
            }
        } else {
            // Lichess - simpler load more button without counts, since their api is slow as hell
            if (this.allGames.length > 0) {
                buttonHtml = `<li class="load-more-container">
                    <button class="load-more-button">Load More Games</button>
                </li>`;
            }
        }
            
        if (buttonHtml) {
            this.$container.append(buttonHtml);
            
            const $loadMoreBtn = this.$container.find('.load-more-button');
            if ($loadMoreBtn.length) {
                $loadMoreBtn.on('click', () => this.filterAndRenderGames(false));
            }
        }
    }

    createGameItem(game) {
        const resultIcons = {
            win: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path d="M64 32C28.7 32 0 60.7 0 96L0 416c0 35.3 28.7 64 64 64l320 0c35.3 0 64-28.7 64-64l0-320c0-35.3-28.7-64-64-64L64 32zM200 344l0-64-64 0c-13.3 0-24-10.7-24-24s10.7-24 24-24l64 0 0-64c0-13.3 10.7-24 24-24s24 10.7 24 24l0 64 64 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-64 0 0 64c0 13.3-10.7 24-24 24s-24-10.7-24-24z" fill="currentColor"/></svg>',
            loss: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path d="M64 32C28.7 32 0 60.7 0 96L0 416c0 35.3 28.7 64 64 64l320 0c35.3 0 64-28.7 64-64l0-320c0-35.3-28.7-64-64-64L64 32zm79 143c9.4-9.4 24.6-9.4 33.9 0l47 47 47-47c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9l-47 47 47 47c9.4 9.4 9.4 24.6 0 33.9s-24.6 9.4-33.9 0l-47-47-47 47c-9.4 9.4-24.6 9.4-33.9 0s-9.4-24.6 0-33.9l47-47-47-47c-9.4-9.4-9.4-24.6 0-33.9z" fill="currentColor"/></svg>',
            draw: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path d="M64 32C28.7 32 0 60.7 0 96L0 416c0 35.3 28.7 64 64 64l320 0c35.3 0 64-28.7 64-64l0-320c0-35.3-28.7-64-64-64L64 32zm88 200l144 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-144 0c-13.3 0-24-10.7-24-24s10.7-24 24-24z" fill="currentColor"/></svg>'
        };

        const timeIcons = {
            [TimeControl.BULLET]: `<svg class="${TimeControl.BULLET}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--!Font Awesome Free 6.7.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc.--><path d="M493.7 .9L299.4 75.6l2.3-29.3c1-12.8-12.8-21.5-24-15.1L101.3 133.4C38.6 169.7 0 236.6 0 309C0 421.1 90.9 512 203 512c72.4 0 139.4-38.6 175.7-101.3L480.8 234.3c6.5-11.1-2.2-25-15.1-24l-29.3 2.3L511.1 18.3c.6-1.5 .9-3.2 .9-4.8C512 6 506 0 498.5 0c-1.7 0-3.3 .3-4.8 .9zM192 192a128 128 0 1 1 0 256 128 128 0 1 1 0-256zm0 96a32 32 0 1 0 -64 0 32 32 0 1 0 64 0zm16 96a16 16 0 1 0 0-32 16 16 0 1 0 0 32z" fill="currentColor"/></svg>`,
            [TimeControl.BLITZ]: `<svg class="${TimeControl.BLITZ}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><!--!Font Awesome Free 6.7.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc.--><path d="M0 256L28.5 28c2-16 15.6-28 31.8-28H228.9c15 0 27.1 12.1 27.1 27.1c0 3.2-.6 6.5-1.7 9.5L208 160H347.3c20.2 0 36.7 16.4 36.7 36.7c0 7.4-2.2 14.6-6.4 20.7l-192.2 281c-5.9 8.6-15.6 13.7-25.9 13.7h-2.9c-15.7 0-28.5-12.8-28.5-28.5c0-2.3 .3-4.6 .9-6.9L176 288H32c-17.7 0-32-14.3-32-32z" fill="currentColor"/></svg>`,
            [TimeControl.RAPID]: `<svg class="${TimeControl.RAPID}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><!--!Font Awesome Free 6.7.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc.--><path d="M176 0c-17.7 0-32 14.3-32 32s14.3 32 32 32l16 0 0 34.4C92.3 113.8 16 200 16 304c0 114.9 93.1 208 208 208s208-93.1 208-208c0-41.8-12.3-80.7-33.5-113.2l24.1-24.1c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L355.7 143c-28.1-23-62.2-38.8-99.7-44.6L256 64l16 0c17.7 0 32-14.3 32-32s-14.3-32-32-32L224 0 176 0zm72 192l0 128c0 13.3-10.7 24-24 24s-24-10.7-24-24l0-128c0-13.3 10.7-24 24-24s24 10.7 24 24z" fill="currentColor"/></svg>`,
            other: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M256 512C114.6 512 0 397.4 0 256S114.6 0 256 0S512 114.6 512 256s-114.6 256-256 256zM232 120V256c0 8 4 15.5 10.7 20l96 64c11 7.4 25.9 4.4 33.3-6.7s4.4-25.9-6.7-33.3L280 243.2V120c0-13.3-10.7-24-24-24s-24 10.7-24 24z" fill="currentColor"/></svg>`
        };

        const opponent = game.isWhite 
            ? { name: game.black, rating: game.blackRating }
            : { name: game.white, rating: game.whiteRating };
        
        const displayAccuracy = game.accuracy !== '-' ? `${game.accuracy}%` : '--';

        const profilePicture = this.currentPlatform === Platform.LICHESS 
            ? `<div class="profile-picture-placeholder"></div>`
            : `<img class="profile-picture" src="./assets/placeholders/white_400.png" data-username="${opponent.name}">`;

        // Handle PGN games differently - they load directly without URL params
        const gameItemContent = game.platform === Platform.PGN ? `
            <div class="game-item pgn-game-item" data-pgn="${encodeURIComponent(game.pgn)}">
                <div class="left-side">
                    <div class="opponent">
                        ${profilePicture}
                        <h4 class="name">${opponent.name}</h4>
                        <p class="rating">${opponent.rating}</p>
                    </div>
                </div>
                <div class="right-side">
                    <div class="accuracy">${displayAccuracy}</div>
                    <div class="game-time">${timeIcons[game.timeControl] || timeIcons.other}</div>
                    <div class="result ${game.result}">
                        ${resultIcons[game.result]}
                    </div>
                </div>
            </div>
        ` : `
            <a class="game-item" href="index.html?platform=${game.platform}&user=${encodeURIComponent(this.currentUsername)}&id=${game.gameId}">
                <div class="left-side">
                    <div class="opponent">
                        ${profilePicture}
                        <h4 class="name">${opponent.name}</h4>
                        <p class="rating">${opponent.rating}</p>
                    </div>
                </div>
                <div class="right-side">
                    <div class="accuracy">${displayAccuracy}</div>
                    <div class="game-time">${timeIcons[game.timeControl] || timeIcons.other}</div>
                    <div class="result ${game.result}">
                        ${resultIcons[game.result]}
                    </div>
                </div>
            </a>
        `;

        return `<li>${gameItemContent}</li>`;
    }

    bindPGNGameEvents() {
        // Bind click events for PGN games
        this.$container.find('.pgn-game-item').off('click').on('click', function(e) {
            e.preventDefault();
            const pgn = decodeURIComponent($(this).data('pgn'));
            
            // Load the PGN game directly using the existing game loader
            import('./GameLoader.js').then(({ GameLoader }) => {
                const gameData = GameLoader.loadGameFromPGN(pgn);
                
                // Trigger a custom event to load the game
                window.dispatchEvent(new CustomEvent('loadPGNGame', { detail: gameData }));
            });
        });
    }

    async loadProfilePictures() {
        if (this.currentPlatform === Platform.LICHESS || this.currentPlatform === Platform.PGN) return;

        const usernames = [...new Set(
            this.$container.find('.profile-picture[data-username]').map(function() {
                return $(this).data('username');
            }).get()
        )];

        await Promise.all(usernames.map(async username => {
            if (this.profilePictureCache.has(username)) {
                this.updateProfilePictures(username, this.profilePictureCache.get(username));
                return;
            }

            try {
                const response = await fetch(`https://api.chess.com/pub/player/${username}`);
                if (response.ok) {
                    const { avatar } = await response.json();
                    if (avatar) {
                        this.profilePictureCache.set(username, avatar);
                        this.updateProfilePictures(username, avatar);
                    }
                }
            } catch (error) {
                console.warn(`Failed to fetch profile picture for ${username}:`, error);
            }
        }));
    }

    updateProfilePictures(username, avatarUrl) {
        this.$container.find(`.profile-picture[data-username="${username}"]`).each(function() {
            const $img = $(this);
            $img.attr('src', avatarUrl);
            $img.on('error', function() {
                $(this).attr('src', './assets/placeholders/white_400.png');
            });
        });
    }
}