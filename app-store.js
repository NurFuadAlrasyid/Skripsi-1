(function () {

    const STORAGE_KEY = 'enrekang-transactions-v1';
    const STOCK_ADJUSTMENT_KEY = 'enrekang-stock-adjustments-v1';
    const STOCK_ACTIVITY_KEY = 'enrekang-stock-activities-v1';
    const CUSTOM_ITEMS_KEY = 'enrekang-custom-items-v1';
    const DELETED_ITEMS_KEY = 'enrekang-deleted-items-v1';
    const TIME_SETTINGS_KEY = 'enrekang-time-settings-v1';
    const TRANSACTION_API_URL = 'ambil_transaksi.php';
    const DATA_URL = 'data_barang.php';
    const DAY_FORMATTER = new Intl.DateTimeFormat('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
    const DATETIME_FORMATTER = new Intl.DateTimeFormat('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    let sourceDataPromise;
    let sourceItemsPromise;
    let transactionSyncPromise;

    function formatRupiah(value) {
        const amount = Number(value) || 0;
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0
        }).format(amount);
    }

    function formatDateTime(value) {
        return DATETIME_FORMATTER.format(new Date(value));
    }

    function formatDate(value) {
        return DAY_FORMATTER.format(new Date(value));
    }

    function readTimeSettings() {
        try {
            const raw = localStorage.getItem(TIME_SETTINGS_KEY);
            if (!raw) {
                return {
                    mode: 'auto',
                    manualBase: '',
                    syncedAt: ''
                };
            }

            const parsed = JSON.parse(raw);
            return {
                mode: parsed.mode === 'manual' ? 'manual' : 'auto',
                manualBase: typeof parsed.manualBase === 'string' ? parsed.manualBase : '',
                syncedAt: typeof parsed.syncedAt === 'string' ? parsed.syncedAt : ''
            };
        } catch (error) {
            console.error('Gagal membaca pengaturan waktu:', error);
            return {
                mode: 'auto',
                manualBase: '',
                syncedAt: ''
            };
        }
    }

    function getCurrentConfiguredDate() {
        const settings = readTimeSettings();

        if (settings.mode === 'manual' && settings.manualBase) {
            const manualBaseTime = new Date(settings.manualBase).getTime();
            const syncedAtTime = new Date(settings.syncedAt || settings.manualBase).getTime();

            if (!Number.isNaN(manualBaseTime) && !Number.isNaN(syncedAtTime)) {
                return new Date(manualBaseTime + (Date.now() - syncedAtTime));
            }
        }

        return new Date();
    }

    function getCurrentConfiguredTimestamp() {
        return getCurrentConfiguredDate().toISOString();
    }

    function getLocalDateString(value = getCurrentConfiguredDate()) {
        const date = value instanceof Date ? value : new Date(value);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function readCurrentUser() {
        try {
            const raw = localStorage.getItem('enrekang-current-user-v1');
            return raw ? JSON.parse(raw) : null;
        } catch (error) {
            console.error('Gagal membaca user aktif:', error);
            return null;
        }
    }

    function normalizeText(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();
    }

    function cloneNode(node) {
        return JSON.parse(JSON.stringify(node));
    }

    function getItemKey(item) {
        if (item.barcode) {
            return `barcode:${item.barcode}`;
        }
        if (item.kodeItem) {
            return `kode:${item.kodeItem}`;
        }
        return `fallback:${item.__path || ''}|${item.namaItem || ''}`;
    }

    function flattenData(node, path, collector) {
        if (Array.isArray(node)) {
            node.forEach((item) => {
                collector.push({
                    ...item,
                    __path: path.join(' / '),
                    __lokasi: path[0] || '',
                    __kategori: path.slice(1).join(' / '),
                    __itemKey: getItemKey({ ...item, __path: path.join(' / ') })
                });
            });
            return;
        }

        if (node && typeof node === 'object') {
            Object.entries(node).forEach(([key, value]) => {
                flattenData(value, path.concat(key), collector);
            });
        }
    }

    async function getSourceData() {
        if (!sourceDataPromise) {
            sourceDataPromise = fetch(DATA_URL).then((response) => {
                if (!response.ok) {
                    throw new Error('Gagal memuat data barang.');
                }
                return response.json();
            });
        }
        return cloneNode(await sourceDataPromise);
    }

    async function getBaseSourceItems() {
        if (!sourceItemsPromise) {
            sourceItemsPromise = getSourceData().then((data) => {
                const collector = [];
                flattenData(data, [], collector);
                return collector;
            });
        }
        return (await sourceItemsPromise).map((item) => ({ ...item }));
    }

    function getCustomItems() {
        try {
            const raw = localStorage.getItem(CUSTOM_ITEMS_KEY);
            if (!raw) {
                return [];
            }
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            console.error('Gagal membaca barang lokal tambahan:', error);
            return [];
        }
    }

    function saveCustomItems(items) {
        localStorage.setItem(CUSTOM_ITEMS_KEY, JSON.stringify(items));
        emitStockEvent();
    }

    function getDeletedItemKeys() {
        try {
            const raw = localStorage.getItem(DELETED_ITEMS_KEY);
            if (!raw) {
                return [];
            }
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed.filter((itemKey) => typeof itemKey === 'string' && itemKey) : [];
        } catch (error) {
            console.error('Gagal membaca daftar barang terhapus:', error);
            return [];
        }
    }

    function saveDeletedItemKeys(itemKeys) {
        localStorage.setItem(DELETED_ITEMS_KEY, JSON.stringify(itemKeys));
        emitStockEvent();
    }

    async function getSourceItems() {
        const [baseItems, customItems] = await Promise.all([
            getBaseSourceItems(),
            Promise.resolve(getCustomItems())
        ]);
        const deletedKeys = new Set(getDeletedItemKeys());
        return [...baseItems, ...customItems]
            .filter((item) => !deletedKeys.has(item.__itemKey))
            .map((item) => ({ ...item }));
    }

    function getTransactions() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) {
                return [];
            }
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            console.error('Gagal membaca transaksi lokal:', error);
            return [];
        }
    }

    function getStockAdjustments() {
        try {
            const raw = localStorage.getItem(STOCK_ADJUSTMENT_KEY);
            if (!raw) {
                return {};
            }
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        } catch (error) {
            console.error('Gagal membaca penyesuaian stok lokal:', error);
            return {};
        }
    }

    function getStockActivities() {
        try {
            const raw = localStorage.getItem(STOCK_ACTIVITY_KEY);
            if (!raw) {
                return [];
            }
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            console.error('Gagal membaca aktivitas stok lokal:', error);
            return [];
        }
    }

    function emitStockEvent() {
        window.dispatchEvent(new CustomEvent('enrekang-stock-data-updated'));
    }

    function saveTransactions(transactions) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
        window.dispatchEvent(new CustomEvent('enrekang-transactions-updated', {
            detail: { count: transactions.length }
        }));
        emitStockEvent();
    }

    async function syncTransactionsFromServer(force = false) {
        if (!force && transactionSyncPromise) {
            return transactionSyncPromise;
        }

        transactionSyncPromise = fetch(TRANSACTION_API_URL)
            .then((response) => {
                if (!response.ok) {
                    throw new Error('Gagal memuat transaksi dari server.');
                }
                return response.json();
            })
            .then((payload) => {
                const transactions = Array.isArray(payload.transactions) ? payload.transactions : [];
                saveTransactions(transactions);
                return transactions;
            })
            .catch((error) => {
                console.error('Gagal sinkron transaksi:', error);
                return getTransactions();
            })
            .finally(() => {
                transactionSyncPromise = null;
            });

        return transactionSyncPromise;
    }

    function saveStockAdjustments(adjustments) {
        localStorage.setItem(STOCK_ADJUSTMENT_KEY, JSON.stringify(adjustments));
        emitStockEvent();
    }

    function saveStockActivities(activities) {
        localStorage.setItem(STOCK_ACTIVITY_KEY, JSON.stringify(activities));
        emitStockEvent();
    }

    function getSortedTransactions() {
        return getTransactions().sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
    }

    function getSoldQuantityMap(transactions) {
        return transactions.reduce((map, transaction) => {
            transaction.items.forEach((item) => {
                map[item.itemKey] = (map[item.itemKey] || 0) + Number(item.qty || 0);
            });
            return map;
        }, {});
    }

    function getAddedQuantityMap() {
        const adjustments = getStockAdjustments();
        return Object.entries(adjustments).reduce((map, [itemKey, qty]) => {
            map[itemKey] = Number(qty || 0);
            return map;
        }, {});
    }

    async function getEffectiveItems() {
        await syncTransactionsFromServer();
        const [items, transactions] = await Promise.all([getSourceItems(), Promise.resolve(getTransactions())]);
        const soldMap = getSoldQuantityMap(transactions);
        const addedMap = getAddedQuantityMap();

        return items.map((item) => {
            const sold = soldMap[item.__itemKey] || 0;
            const added = addedMap[item.__itemKey] || 0;
            const baseStock = Number(item.stok || 0);
            return {
                ...item,
                stokAwal: baseStock,
                stokTambahan: added,
                stokTerjual: sold,
                currentStock: Math.max(0, baseStock + added - sold)
            };
        });
    }

    async function getStructuredStock() {
        const [data, items] = await Promise.all([getSourceData(), getEffectiveItems()]);
        const stockMap = items.reduce((map, item) => {
            map[item.__itemKey] = item;
            return map;
        }, {});
        const deletedKeys = new Set(getDeletedItemKeys());

        function decorateNode(node, path) {
            if (Array.isArray(node)) {
                return node.reduce((result, item) => {
                    const itemKey = getItemKey({ ...item, __path: path.join(' / ') });
                    if (deletedKeys.has(itemKey)) {
                        return result;
                    }

                    const decorated = stockMap[itemKey];
                    result.push(decorated ? { ...decorated } : { ...item, currentStock: Number(item.stok || 0) });
                    return result;
                }, []);
            }

            const result = {};
            Object.entries(node).forEach(([key, value]) => {
                result[key] = decorateNode(value, path.concat(key));
            });
            return result;
        }

        return decorateNode(data, []);
    }

    async function searchItems(query, options) {
        const settings = {
            limit: 20,
            includeZeroStock: false,
            ...options
        };
        const items = await getEffectiveItems();
        const keyword = normalizeText(query);

        const filtered = items.filter((item) => {
            if (!settings.includeZeroStock && item.currentStock <= 0) {
                return false;
            }
            if (!keyword) {
                return true;
            }
            const searchable = normalizeText([
                item.namaItem,
                item.kodeItem,
                item.barcode,
                item.__lokasi,
                item.__kategori
            ].join(' '));
            return searchable.includes(keyword);
        });

        return filtered.slice(0, settings.limit);
    }

    function isTransactionInRange(transaction, startDate, endDate) {
        const transactionDate = new Date(transaction.createdAt);
        if (Number.isNaN(transactionDate.getTime())) {
            return false;
        }

        if (startDate) {
            const start = new Date(`${startDate}T00:00:00`);
            if (transactionDate < start) {
                return false;
            }
        }

        if (endDate) {
            const end = new Date(`${endDate}T23:59:59`);
            if (transactionDate > end) {
                return false;
            }
        }

        return true;
    }

    function buildInvoiceNumber(transactions, createdAt) {
        const now = new Date(createdAt);
        const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        const prefix = `INV-${datePart}-`;
        const lastSequence = transactions.reduce((maxValue, transaction) => {
            const invoiceNumber = String(transaction.invoiceNumber || '').trim();
            if (!invoiceNumber.startsWith(prefix)) {
                return maxValue;
            }

            const sequenceText = invoiceNumber.slice(prefix.length);
            const sequenceValue = Number(sequenceText);
            if (!Number.isInteger(sequenceValue) || sequenceValue < 0) {
                return maxValue;
            }

            return Math.max(maxValue, sequenceValue);
        }, 0);

        return `${prefix}${String(lastSequence + 1).padStart(3, '0')}`;
    }

    async function createTransaction(payload) {
        const cart = Array.isArray(payload.cart) ? payload.cart : [];
        if (!cart.length) {
            throw new Error('Keranjang masih kosong.');
        }

        const effectiveItems = await getEffectiveItems();
        const itemMap = effectiveItems.reduce((map, item) => {
            map[item.__itemKey] = item;
            return map;
        }, {});

        const lineItems = cart.map((item) => {
            const masterItem = itemMap[item.itemKey];
            if (!masterItem) {
                throw new Error(`Barang ${item.namaItem || item.itemKey} tidak ditemukan.`);
            }
            const qty = Number(item.qty || 0);
            if (qty <= 0) {
                throw new Error(`Qty untuk ${masterItem.namaItem} tidak valid.`);
            }
            if (qty > masterItem.currentStock) {
                throw new Error(`Stok ${masterItem.namaItem} tidak mencukupi.`);
            }

            return {
                itemKey: masterItem.__itemKey,
                kodeItem: masterItem.kodeItem || '',
                barcode: masterItem.barcode || '',
                namaItem: masterItem.namaItem,
                lokasi: masterItem.__path,
                hargaPokok: Number(masterItem.hargaPokok || 0),
                hargaJual: Number(masterItem.hargaJual || 0),
                qty,
                subtotal: qty * Number(masterItem.hargaJual || 0)
            };
        });

        const total = lineItems.reduce((sum, item) => sum + item.subtotal, 0);
        const paymentAmount = Number(payload.paymentAmount || 0);
        if (paymentAmount < total) {
            throw new Error('Nominal bayar lebih kecil dari total belanja.');
        }

        await syncTransactionsFromServer(true);
        const transactions = getSortedTransactions();
        const createdAt = getCurrentConfiguredTimestamp();
        const transaction = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            invoiceNumber: buildInvoiceNumber(transactions, createdAt),
            createdAt,
            cashierName: payload.cashierName || 'Kasir',
            customerName: String(payload.customerName || '').trim(),
            notes: String(payload.notes || '').trim(),
            paymentAmount,
            total,
            changeAmount: paymentAmount - total,
            totalItems: lineItems.reduce((sum, item) => sum + item.qty, 0),
            totalCost: lineItems.reduce((sum, item) => sum + (item.qty * item.hargaPokok), 0),
            status: 'Lunas',
            items: lineItems
        };

        const currentUser = readCurrentUser();
        const saveResponse = await fetch('simpan_transaksi.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                ...transaction,
                user: currentUser ? {
                    username: currentUser.username || '',
                    name: currentUser.name || transaction.cashierName
                } : {
                    username: '',
                    name: transaction.cashierName
                }
            })
        });

        const saveResponseText = await saveResponse.text();
        let saveResult = null;

        try {
            saveResult = saveResponseText ? JSON.parse(saveResponseText) : null;
        } catch (error) {
            throw new Error(`Server mengirim respon yang tidak valid: ${saveResponseText || 'kosong'}`);
        }

        if (!saveResponse.ok) {
            throw new Error(saveResult?.message || `Gagal menyimpan transaksi ke server (${saveResponse.status}).`);
        }

        if (!saveResult.success) {
            throw new Error(saveResult.message || 'Gagal menyimpan transaksi ke database.');
        }

        await syncTransactionsFromServer(true);
        return {
            ...transaction,
            transactionId: Number(saveResult.transactionId || 0),
            serverMessage: saveResult.message || ''
        };
    }

    async function deleteTransaction(transactionId) {
        const response = await fetch('hapus_transaksi.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                transactionId: Number(transactionId || 0)
            })
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Transaksi yang ingin dihapus tidak ditemukan.');
        }

        await syncTransactionsFromServer(true);
    }

    async function deleteTransactionItem(transactionId, detailId) {
        const response = await fetch('hapus_item_transaksi.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                transactionId: Number(transactionId || 0),
                detailId: Number(detailId || 0)
            })
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Item transaksi yang ingin dihapus tidak ditemukan.');
        }

        await syncTransactionsFromServer(true);
    }

    async function addStock(itemKey, quantity) {
        const normalizedQty = Number(quantity || 0);
        if (!Number.isFinite(normalizedQty) || normalizedQty <= 0) {
            throw new Error('Jumlah stok tambahan harus lebih besar dari 0.');
        }

        const items = await getSourceItems();
        const itemExists = items.some((item) => item.__itemKey === itemKey);
        if (!itemExists) {
            throw new Error('Barang yang ingin ditambah stoknya tidak ditemukan.');
        }

        const adjustments = getStockAdjustments();
        adjustments[itemKey] = Number(adjustments[itemKey] || 0) + normalizedQty;
        saveStockAdjustments(adjustments);

        const stockActivities = getStockActivities();
        const item = items.find((entry) => entry.__itemKey === itemKey);
        stockActivities.unshift({
            id: `stock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: 'stock-in',
            createdAt: getCurrentConfiguredTimestamp(),
            itemKey,
            kodeItem: item?.kodeItem || '',
            barcode: item?.barcode || '',
            namaItem: item?.namaItem || '',
            lokasi: item?.__path || '',
            quantity: normalizedQty
        });
        saveStockActivities(stockActivities.slice(0, 100));
        return adjustments[itemKey];
    }

    async function setStock(itemKey, quantity) {
        const normalizedQty = Number(quantity);
        if (!Number.isFinite(normalizedQty) || normalizedQty < 0) {
            throw new Error('Stok akhir harus berupa angka 0 atau lebih besar.');
        }

        const targetQty = Math.round(normalizedQty);
        const items = await getEffectiveItems();
        const item = items.find((entry) => entry.__itemKey === itemKey);
        if (!item) {
            throw new Error('Barang yang ingin diubah stoknya tidak ditemukan.');
        }

        const currentQty = Number(item.currentStock || 0);
        const delta = targetQty - currentQty;
        const nextAdjustment = targetQty + Number(item.stokTerjual || 0) - Number(item.stokAwal || 0);
        const adjustments = getStockAdjustments();

        if (nextAdjustment === 0) {
            delete adjustments[itemKey];
        } else {
            adjustments[itemKey] = nextAdjustment;
        }

        saveStockAdjustments(adjustments);

        if (delta !== 0) {
            const stockActivities = getStockActivities();
            stockActivities.unshift({
                id: `stock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                type: 'stock-set',
                createdAt: getCurrentConfiguredTimestamp(),
                itemKey,
                kodeItem: item.kodeItem || '',
                barcode: item.barcode || '',
                namaItem: item.namaItem || '',
                lokasi: item.__path || '',
                previousQuantity: currentQty,
                targetQuantity: targetQty,
                quantity: delta
            });
            saveStockActivities(stockActivities.slice(0, 100));
        }

        return targetQty;
    }

    async function addCustomItem(payload) {
        const baseItems = await getBaseSourceItems();
        const customItems = getCustomItems();
        const allItems = [...baseItems, ...customItems];

        const namaItem = String(payload.namaItem || '').trim();
        const kodeItem = String(payload.kodeItem || '').trim();
        const barcode = String(payload.barcode || '').trim();
        const lokasi = String(payload.lokasi || '').trim();
        const kategori = String(payload.kategori || '').trim();
        const hargaPokok = Number(payload.hargaPokok || 0);
        const hargaJual = Number(payload.hargaJual || 0);
        const stok = Number(payload.stok || 0);

        if (!namaItem) {
            throw new Error('Nama barang wajib diisi.');
        }
        if (!lokasi) {
            throw new Error('Lokasi wajib diisi.');
        }
        if (!kategori) {
            throw new Error('Kategori wajib diisi.');
        }
        if (!Number.isFinite(stok) || stok < 0 || !Number.isInteger(stok)) {
            throw new Error('Stok awal harus berupa bilangan bulat 0 atau lebih besar.');
        }
        if (!Number.isFinite(hargaPokok) || hargaPokok < 0) {
            throw new Error('Harga pokok harus berupa angka 0 atau lebih besar.');
        }
        if (!Number.isFinite(hargaJual) || hargaJual < 0) {
            throw new Error('Harga jual harus berupa angka 0 atau lebih besar.');
        }

        const nextPath = [lokasi, kategori].filter(Boolean).join(' / ');
        const itemKeyCandidate = getItemKey({
            barcode,
            kodeItem,
            __path: nextPath,
            namaItem
        });

        const duplicate = allItems.find((item) => {
            if (barcode && item.barcode === barcode) {
                return true;
            }
            if (kodeItem && item.kodeItem === kodeItem) {
                return true;
            }
            return item.__itemKey === itemKeyCandidate;
        });

        if (duplicate) {
            throw new Error('Barang dengan kode, barcode, atau identitas yang sama sudah ada.');
        }

        const customItem = {
            kodeItem,
            barcode,
            namaItem,
            hargaPokok,
            hargaJual,
            stok,
            __path: nextPath,
            __lokasi: lokasi,
            __kategori: kategori,
            __itemKey: itemKeyCandidate,
            __isCustom: true,
            __createdAt: getCurrentConfiguredTimestamp()
        };

        saveCustomItems([customItem, ...customItems]);

        if (stok > 0) {
            const stockActivities = getStockActivities();
            stockActivities.unshift({
                id: `stock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                type: 'stock-create',
                createdAt: getCurrentConfiguredTimestamp(),
                itemKey: customItem.__itemKey,
                kodeItem,
                barcode,
                namaItem,
                lokasi: nextPath,
                previousQuantity: 0,
                targetQuantity: stok,
                quantity: stok
            });
            saveStockActivities(stockActivities.slice(0, 100));
        }

        return { ...customItem };
    }

    async function deleteItem(itemKey) {
        const normalizedItemKey = String(itemKey || '').trim();
        if (!normalizedItemKey) {
            throw new Error('Barang yang ingin dihapus tidak valid.');
        }

        const items = await getSourceItems();
        const targetItem = items.find((item) => item.__itemKey === normalizedItemKey);
        if (!targetItem) {
            throw new Error('Barang yang ingin dihapus tidak ditemukan.');
        }

        if (targetItem.__isCustom) {
            const customItems = getCustomItems().filter((item) => item.__itemKey !== normalizedItemKey);
            saveCustomItems(customItems);
        } else {
            const deletedItemKeys = getDeletedItemKeys();
            if (!deletedItemKeys.includes(normalizedItemKey)) {
                saveDeletedItemKeys([normalizedItemKey, ...deletedItemKeys]);
            }
        }

        const adjustments = getStockAdjustments();
        if (Object.prototype.hasOwnProperty.call(adjustments, normalizedItemKey)) {
            delete adjustments[normalizedItemKey];
            saveStockAdjustments(adjustments);
        }

        const nextActivities = getStockActivities().filter((activity) => activity.itemKey !== normalizedItemKey);
        saveStockActivities(nextActivities);

        return { ...targetItem };
    }

    function getTransactionsInRange(startDate, endDate) {
        return getSortedTransactions().filter((transaction) => isTransactionInRange(transaction, startDate, endDate));
    }

    async function getDashboardSummary() {
        await syncTransactionsFromServer();
        const items = await getEffectiveItems();
        const transactions = getSortedTransactions();
        const today = getLocalDateString();
        const todayTransactions = getTransactionsInRange(today, today);
        const lowStockItems = items
            .filter((item) => item.currentStock > 0 && item.currentStock <= 5)
            .sort((left, right) => left.currentStock - right.currentStock || left.namaItem.localeCompare(right.namaItem));

        return {
            totalProduk: items.length,
            totalUnitStok: items.reduce((sum, item) => sum + Number(item.currentStock || 0), 0),
            stokMenipis: lowStockItems.length,
            lowStockItems,
            penjualanHariIni: todayTransactions.reduce((sum, item) => sum + Number(item.total || 0), 0),
            transaksiHariIni: todayTransactions.length,
            transaksiTerbaru: transactions.slice(0, 5)
        };
    }

    async function getReport(startDate, endDate) {
        await syncTransactionsFromServer();
        const transactions = getTransactionsInRange(startDate, endDate);
        const summary = transactions.reduce((result, transaction) => {
            result.totalOmzet += Number(transaction.total || 0);
            result.totalModal += Number(transaction.totalCost || 0);
            result.totalTransaksi += 1;
            result.totalItemTerjual += Number(transaction.totalItems || 0);
            return result;
        }, {
            totalOmzet: 0,
            totalModal: 0,
            totalTransaksi: 0,
            totalItemTerjual: 0
        });

        const itemsByName = {};
        const lineItems = [];
        transactions.forEach((transaction) => {
            transaction.items.forEach((item) => {
                const key = item.itemKey;
                if (!itemsByName[key]) {
                    itemsByName[key] = {
                        namaItem: item.namaItem,
                        barcode: item.barcode,
                        qty: 0,
                        omzet: 0
                    };
                }
                itemsByName[key].qty += Number(item.qty || 0);
                itemsByName[key].omzet += Number(item.subtotal || 0);

                lineItems.push({
                    transactionId: transaction.id,
                    detailId: item.detailId || 0,
                    itemKey: item.itemKey,
                    namaItem: item.namaItem,
                    customerName: String(transaction.customerName || '').trim() === 'Pelanggan Umum' ? '' : String(transaction.customerName || '').trim(),
                    barcode: item.barcode || '',
                    qty: Number(item.qty || 0),
                    omzet: Number(item.subtotal || 0),
                    notes: String(transaction.notes || '').trim(),
                    createdAt: transaction.createdAt
                });
            });
        });

        return {
            transactions,
            summary: {
                ...summary,
                labaKotor: summary.totalOmzet - summary.totalModal
            },
            lineItems: lineItems.sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt)),
            topItems: Object.values(itemsByName)
                .sort((left, right) => right.qty - left.qty)
                .slice(0, 10)
        };
    }

    function clearTransactions() {
        saveTransactions([]);
    }

    window.EnrekangStore = {
        formatRupiah,
        formatDate,
        formatDateTime,
        getLocalDateString,
        getItemKey,
        getSourceData,
        getSourceItems,
        getEffectiveItems,
        getStructuredStock,
        searchItems,
        getStockActivities,
        syncTransactions: syncTransactionsFromServer,
        getTransactions: getSortedTransactions,
        getTransactionsInRange,
        createTransaction,
        deleteTransaction,
        deleteTransactionItem,
        addStock,
        setStock,
        addCustomItem,
        deleteItem,
        getDashboardSummary,
        getReport,
        clearTransactions
    };
})();