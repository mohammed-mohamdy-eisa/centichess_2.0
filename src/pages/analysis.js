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

    // Make profile pictures transparent for Lichess or PGN games
    if (game.platform === Platform.LICHESS || game.platform === Platform.PGN) {
        $('#white-profile, #black-profile').css('opacity', 0);
    } else {
        $('#white-profile, #black-profile').css('opacity', 1);
    }

    // Listen for PGN game loading events
    window.addEventListener('loadPGNGame', (event) => {
        const gameData = event.detail;

        //GameLoader.matchGameURL()

        console.log(gameData)
        chessUI.load(gameData);
        loadPlayerData(gameData.white, gameData.black);

        // Update profile picture transparency for dynamically loaded PGN
        if (gameData.platform === Platform.LICHESS || gameData.platform === Platform.PGN) {
            $('#white-profile, #black-profile').css('opacity', 0);
        } else {
            $('#white-profile, #black-profile').css('opacity', 1);
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

