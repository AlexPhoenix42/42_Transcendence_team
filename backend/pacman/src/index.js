import Game from './js/Game.js';
import MultiplayerGame from './js/net/MultiplayerGame.js';

(() => {
    const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);

    const options = {
        el : document.querySelector('.js-pacman-playground'),
        width : vw * 0.9,
        height : vh * 0.9,
        position : 'relative'
    };

    // `?room=<name>` turns the same page into the multiplayer game; without it
    // this is the untouched single-player jsPacman.
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');

    if (room) {
        window.__game = new MultiplayerGame({
            ...options,
            room,
            serverUrl : params.get('server') || undefined,
            role : params.get('role') || undefined,
            playerName : params.get('name') || undefined,
            autoStart : params.get('autostart') === '1'
        });
    } else {
        window.__game = new Game(options);
    }
})();
