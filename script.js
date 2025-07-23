document.addEventListener('DOMContentLoaded', () => {
    const gameBoard = document.getElementById('game-board');
    const comboCountElement = document.getElementById('combo-count');
    const rows = 5;
    const cols = 6;
    const dropSize = 60;
    const dropTypes = ['#E53935', '#1E88E5', '#43A047', '#FDD835', '#8E24AA', '#FB8C00'];

    let board = [];
    let draggedDrop = null;
    let isAnimating = false;

    // ボードの初期化
    function initializeBoard() {
        gameBoard.innerHTML = '';
        board = Array.from({ length: rows }, () => Array(cols).fill(null));

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const drop = createDrop(r, c);
                board[r][c] = drop;
                gameBoard.appendChild(drop);
            }
        }

        // 初期配置でマッチが発生しないように調整
        while (true) {
            const matchGroups = findMatchGroups();
            if (matchGroups.length === 0) break;
            const allMatches = matchGroups.flat();
            removeAndRefillForInitialization(allMatches); // 初期化時のみに呼び出される
        }
        updateAllDropPositions();
    }

    // ドロップ要素の作成
    function createDrop(r, c, type) {
        const drop = document.createElement('div');
        drop.classList.add('drop');
        const dropType = type || dropTypes[Math.floor(Math.random() * dropTypes.length)];
        drop.style.backgroundColor = dropType;
        drop.dataset.type = dropType;
        drop.dataset.row = r;
        drop.dataset.col = c;
        return drop;
    }

    // ドロップのDOM上の位置を更新
    function updateDropPosition(drop) {
        const r = parseInt(drop.dataset.row);
        const c = parseInt(drop.dataset.col);
        drop.style.transform = `translate(${c * dropSize}px, ${r * dropSize}px)`;
    }

    // 全てのドロップのDOM上の位置を更新
    function updateAllDropPositions() {
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (board[r][c]) {
                    updateDropPosition(board[r][c]);
                }
            }
        }
    }

    // --- ドラッグ&ドロップのロジック ---
    let startX, startY, startLeft, startTop;

    gameBoard.addEventListener('mousedown', (e) => {
        if (isAnimating || !e.target.classList.contains('drop')) return;

        draggedDrop = e.target;
        const r = parseInt(draggedDrop.dataset.row);
        const c = parseInt(draggedDrop.dataset.col);
        startLeft = c * dropSize;
        startTop = r * dropSize;
        startX = e.clientX;
        startY = e.clientY;
        draggedDrop.classList.add('dragging');
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    function onMouseMove(e) {
        if (!draggedDrop) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        let newLeft = startLeft + dx;
        let newTop = startTop + dy;
        draggedDrop.style.transform = `translate(${newLeft}px, ${newTop}px) scale(1.15)`;
        const targetCol = Math.min(cols - 1, Math.max(0, Math.floor((newLeft + dropSize / 2) / dropSize)));
        const targetRow = Math.min(rows - 1, Math.max(0, Math.floor((newTop + dropSize / 2) / dropSize)));
        const sourceRow = parseInt(draggedDrop.dataset.row);
        const sourceCol = parseInt(draggedDrop.dataset.col);
        if (targetRow !== sourceRow || targetCol !== sourceCol) {
            const targetDrop = board[targetRow][targetCol];
            if (targetDrop) {
                swapDrops(draggedDrop, targetDrop);
                updateDropPosition(targetDrop);
            }
        }
    }

    function onMouseUp() {
        if (!draggedDrop) return;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        draggedDrop.classList.remove('dragging');
        updateAllDropPositions();
        handleMatches();
        draggedDrop = null;
    }

    // 2つのドロップを交換
    function swapDrops(drop1, drop2) {
        const [r1, c1] = [parseInt(drop1.dataset.row), parseInt(drop1.dataset.col)];
        const [r2, c2] = [parseInt(drop2.dataset.row), parseInt(drop2.dataset.col)];
        [board[r1][c1], board[r2][c2]] = [board[r2][c2], board[r1][c1]];
        [drop1.dataset.row, drop2.dataset.row] = [r2, r1];
        [drop1.dataset.col, drop2.dataset.col] = [c2, c1];
    }

    // --- マッチングロジック ---
    async function handleMatches() {
        isAnimating = true;
        let totalCombos = 0;
        while (true) {
            const matchGroups = findMatchGroups();
            if (matchGroups.length === 0) break;

            // マッチグループを消滅アニメーションの順序でソート（下から上、同じ高さなら左から右）
            matchGroups.sort((a, b) => {
                const rA = Math.max(...a.map(d => parseInt(d.dataset.row)));
                const cA = Math.min(...a.map(d => parseInt(d.dataset.col)));
                const rB = Math.max(...b.map(d => parseInt(d.dataset.row)));
                const cB = Math.min(...b.map(d => parseInt(d.dataset.col)));
                if (rA !== rB) return rB - rA; // 行が大きい方が先に（下にあるものが先に）
                return cA - cB; // 同じ行なら列が小さい方が先に（左にあるものが先に）
            });

            totalCombos += matchGroups.length;
            comboCountElement.textContent = totalCombos;

            for (const group of matchGroups) {
                removeMatches(group); // マッチしたドロップをボードから論理的に削除し、matchedクラスを追加
                await sleep(250); // 次のコンボの消滅アニメーション開始までの間隔
            }
            await sleep(500); // 全ての消去アニメーションが完了するのを待つ

            await shiftAndRefill(); // ドロップをシフトして補充
            await sleep(300); // 落下アニメーションの完了を待つ
        }

        if (totalCombos === 0) {
            comboCountElement.textContent = 0;
        }
        isAnimating = false;
    }

    // マッチするドロップのグループを検索
    function findMatchGroups() {
        const potentialMatches = new Set();
        // 横方向のマッチを検出
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols - 2; c++) {
                const type = board[r][c].dataset.type;
                if (type === board[r][c + 1].dataset.type && type === board[r][c + 2].dataset.type) {
                    potentialMatches.add(board[r][c]);
                    potentialMatches.add(board[r][c + 1]);
                    potentialMatches.add(board[r][c + 2]);
                }
            }
        }
        // 縦方向のマッチを検出
        for (let c = 0; c < cols; c++) {
            for (let r = 0; r < rows - 2; r++) {
                const type = board[r][c].dataset.type;
                if (type === board[r + 1][c].dataset.type && type === board[r + 2][c].dataset.type) {
                    potentialMatches.add(board[r][c]);
                    potentialMatches.add(board[r + 1][c]);
                    potentialMatches.add(board[r + 2][c]);
                }
            }
        }

        const visited = new Set();
        const matchGroups = [];
        for (const drop of potentialMatches) {
            if (visited.has(drop)) continue;
            const group = new Set();
            const queue = [drop];
            visited.add(drop);
            while (queue.length > 0) {
                const currentDrop = queue.shift();
                group.add(currentDrop);
                const r = parseInt(currentDrop.dataset.row);
                const c = parseInt(currentDrop.dataset.col);
                const type = currentDrop.dataset.type;
                [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].forEach(([nr, nc]) => {
                    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                        const neighbor = board[nr][nc];
                        if (neighbor && neighbor.dataset.type === type && potentialMatches.has(neighbor) && !visited.has(neighbor)) {
                            visited.add(neighbor);
                            queue.push(neighbor);
                        }
                    }
                });
            }
            matchGroups.push(Array.from(group));
        }
        return matchGroups;
    }

    // マッチしたドロップをボードから論理的に削除し、消去アニメーション用のクラスを追加
    function removeMatches(matches) {
        for (const drop of matches) {
            const r = parseInt(drop.dataset.row);
            const c = parseInt(drop.dataset.col);
            if (board[r][c] === drop) { // 実際にその位置にあるドロップであることを確認
                drop.classList.add('matched');
                board[r][c] = null; // 論理ボードから削除
            }
        }
    }

    // ドロップの落下と補充
    async function shiftAndRefill() {
        // フェーズ1: 論理ボード内で残っているドロップを下にシフトさせる
        for (let c = 0; c < cols; c++) {
            let writeRow = rows - 1; // ドロップを書き込む行（一番下から開始）
            for (let r = rows - 1; r >= 0; r--) {
                if (board[r][c]) { // ドロップが存在する場合
                    if (writeRow !== r) { // 移動が必要な場合
                        board[writeRow][c] = board[r][c];
                        board[r][c] = null; // 元の位置は空にする
                        board[writeRow][c].dataset.row = writeRow; // ドロップのデータ属性を更新
                    }
                    writeRow--; // 次のドロップを書き込む行を一つ上に
                }
            }
        }

        // フェーズ2: matchedクラスが付与されたDOM要素を実際にドキュメントから削除
        document.querySelectorAll('.matched').forEach(drop => drop.remove());

        // フェーズ3: 空になったスペースに新しいドロップを作成し、追加
        for (let c = 0; c < cols; c++) {
            for (let r = 0; r < rows; r++) {
                if (!board[r][c]) { // 空のマスを検出
                    const newDrop = createDrop(r, c);
                    // 落下アニメーションのために、画面外上部に配置
                    newDrop.style.transform = `translate(${c * dropSize}px, ${-dropSize * 2}px)`;
                    board[r][c] = newDrop;
                    gameBoard.appendChild(newDrop);
                }
            }
        }

        // 新しいDOM要素がブラウザに認識されるための短い遅延
        await sleep(50);

        // フェーズ4: 全てのドロップを最終的なグリッド位置にアニメーションさせる
        updateAllDropPositions();
    }

    // 初期化時のみに使用される、マッチしたドロップのタイプをランダムに変更する関数
    function removeAndRefillForInitialization(matches) {
        for (const drop of matches) {
            const newType = dropTypes[Math.floor(Math.random() * dropTypes.length)];
            drop.style.backgroundColor = newType;
            drop.dataset.type = newType;
        }
    }

    // 指定されたミリ秒数だけ処理を一時停止するヘルパー関数
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ゲームの開始
    initializeBoard();
});
