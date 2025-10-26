import { GameLoader, Platform } from '../components/games/GameLoader.js';
import { ChessUI } from '../components/ChessUI.js';
import { GameGraph } from '../components/report/GameGraph.js';

async function loadPlayerData(white, black) {
    if (!white || !black) return;
    if (!white.name || !black.name) return;

    $("#white-name").text(white.name);
    $("#black-name").text(black.name);

    if (!white.elo || !black.elo) return;

    $("#white-rating").text(white.elo);
    $("#black-rating").text(black.elo);

    if (!white.avatar || !black.avatar) return;

    const whiteAvatar = await white.avatar;
    const blackAvatar = await black.avatar;

    $('#white-profile').attr('src', whiteAvatar);
    $('#black-profile').attr('src', blackAvatar);
}

// Initialize the application when the document is ready
$(document).ready(async () => {
    const chessUI = new ChessUI();
    
    // Make chessUI globally accessible for GameStats navigation
    window.chessUI = chessUI;
    
    let game;
    
    // Check if there's a PGN parameter in the URL
    const urlParams = new URLSearchParams(window.location.search);
    const pgnParam = urlParams.get('pgn');
    
    if (pgnParam) {
        // Load game from PGN parameter
        game = GameLoader.loadGameFromPGN(decodeURIComponent(pgnParam));
    } else {
        // Load game from URL (Chess.com or Lichess)
        game = await GameLoader.loadGameFromURL();
        if (!game) {
            game = GameLoader.loadEmptyGame();
        }
    }

    chessUI.load(game);
    loadPlayerData(game.white, game.black);

    // Hide profile pictures for Lichess or PGN games
    if (game.platform === Platform.LICHESS || game.platform === Platform.PGN) {
        $('#white-profile, #black-profile').hide();
    } else {
        $('#white-profile, #black-profile').show();
    }

    // Listen for PGN game loading events
    window.addEventListener('loadPGNGame', async (event) => {
        const gameData = event.detail;

        //GameLoader.matchGameURL()

        console.log(gameData)
        
        // Mark this as a user-initiated load (game was selected by user)
        const { SidebarOverlay } = await import('../components/report/SidebarOverlay.js');
        SidebarOverlay.setUserInitiatedLoad(true);
        
        chessUI.load(gameData);
        loadPlayerData(gameData.white, gameData.black);

        // Hide profile pictures for dynamically loaded Lichess or PGN games
        if (gameData.platform === Platform.LICHESS || gameData.platform === Platform.PGN) {
            $('#white-profile, #black-profile').hide();
        } else {
            $('#white-profile, #black-profile').show();
        }
    });

    // Tab switching
    $('.tab-button').on('click', function () {
        $('.tab-button').removeClass('active');
        $('.tab-panel').removeClass('active');
        $(this).addClass('active');

        const tabName = $(this).data('tab');
        $('#' + tabName + '-tab').addClass('active');

        GameGraph.render();
        
        // On mobile, scroll down to show tab content
        if (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) {
            const sidebarHeader = document.querySelector('.sidebar-header');
            const header = document.querySelector('.header');
            if (sidebarHeader) {
                setTimeout(() => {
                    // Get the header height to offset the scroll
                    const headerHeight = header ? header.offsetHeight : 0;
                    const elementPosition = sidebarHeader.getBoundingClientRect().top + window.pageYOffset;
                    const offsetPosition = elementPosition - headerHeight - 10; // 10px extra padding
                    
                    window.scrollTo({
                        top: offsetPosition,
                        behavior: 'smooth'
                    });
                }, 100);
            }
        }
    });

    // Navigation toggle
    const toggleElement = (elem) => elem.classList.toggle("active");
    const navToggleBtn = document.querySelector("[data-nav-toggle-btn]");
    const navbar = document.querySelector("[data-navbar]");
    const overlay = document.querySelector("[data-overlay]");

    const toggleNav = () => {
        toggleElement(navToggleBtn);
        toggleElement(navbar);
        toggleElement(document.body);
        overlay.classList.toggle("active");
    };

    navToggleBtn.addEventListener("click", toggleNav);
    overlay.addEventListener("click", toggleNav);
});

