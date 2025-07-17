const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const rooms = {};  // { passcode: [player1, player2] }

// モンスターテンプレート
const monsterTemplate = {
    name: "ドラゴン",
    hp: 100,
    moves: {
        rock: { name: "ファイアパンチ", power: 20 },
        scissors: { name: "ドラゴンクロー", power: 15 },
        paper: { name: "ブレス", power: 25 }
    }
};

io.on('connection', (socket) => {
    console.log('A user connected');

    socket.on('join', (passcode) => {
        console.log(`Player joined passcode: ${passcode}`);

        if (!rooms[passcode]) {
            rooms[passcode] = [];
        }

        rooms[passcode].push(socket);

        // モンスター2体を設定
        socket.monsters = [
            { ...cloneMonster(monsterTemplate), isActive: true },
            { ...cloneMonster(monsterTemplate), isActive: false }
        ];

        if (rooms[passcode].length === 2) {
            rooms[passcode].forEach(s => s.emit('matched'));
        }
    });

    socket.on('swap', ({ passcode }) => {
        const active = socket.monsters.find(m => m.isActive);
        const inactive = socket.monsters.find(m => !m.isActive);

        if (inactive) {
            active.isActive = false;
            inactive.isActive = true;
        }
    });

    socket.on('hand', ({ passcode, hand }) => {
        socket.hand = hand;

        const players = rooms[passcode];
        if (!players) return;

        if (players.every(p => p.hand)) {
            handleBattle(players[0], players[1]);
        }
    });

    socket.on('disconnect', () => {
        for (const passcode in rooms) {
            rooms[passcode] = rooms[passcode].filter(s => s !== socket);
            if (rooms[passcode].length === 0) {
                delete rooms[passcode];
            }
        }
        console.log('A user disconnected');
    });
});

// バトル処理
function handleBattle(p1, p2) {
    const [hand1, hand2] = [p1.hand, p2.hand];
    const result = judge(hand1, hand2);

    const attacker = result[0] === 'win' ? p1 : result[1] === 'win' ? p2 : null;
    const defender = attacker === p1 ? p2 : attacker === p2 ? p1 : null;

    if (attacker && defender) {
        const atkMon = attacker.monsters.find(m => m.isActive);
        const defMon = defender.monsters.find(m => m.isActive);

        const move = atkMon.moves[attacker.hand];
        defMon.hp -= move.power;
        if (defMon.hp < 0) defMon.hp = 0;

        // HP0なら控えモンスターと自動交代
        if (defMon.hp === 0) {
            const nextMon = defender.monsters.find(m => !m.isActive);
            if (nextMon) {
                defMon.isActive = false;
                nextMon.isActive = true;
            }
        }
    }

    // 両者に結果送信
    [p1, p2].forEach(player => {
        player.emit('result', {
            yourHand: player.hand,
            opponentHand: (player === p1 ? p2.hand : p1.hand),
            result: (player === p1 ? result[0] : result[1]),
            yourMonsters: player.monsters,
            opponentMonsters: (player === p1 ? p2.monsters : p1.monsters)
        });
    });

    // 手リセット
    p1.hand = null;
    p2.hand = null;
}

function judge(hand1, hand2) {
    if (hand1 === hand2) return ['draw', 'draw'];

    const win = (hand1 === 'rock' && hand2 === 'scissors') ||
                (hand1 === 'scissors' && hand2 === 'paper') ||
                (hand1 === 'paper' && hand2 === 'rock');

    return win ? ['win', 'lose'] : ['lose', 'win'];
}

function cloneMonster(template) {
    return JSON.parse(JSON.stringify(template));
}

server.listen(3000, () => {
    console.log('Server listening on port 3000');
});
