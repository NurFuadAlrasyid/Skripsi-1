(function () {

    const STORAGE_KEY = 'enrekang-transactions-v1';
    const STOCK_ADJUSTMENT_KEY = 'enrekang-stock-adjustments-v1';
    const STOCK_ACTIVITY_KEY = 'enrekang-stock-activities-v1';
    const DATA_URL = 'data.json';
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

    function getLocalDateString(value = new Date()) {
        const date = value instanceof Date ? value : new Date(value);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
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

    async function getSourceItems() {
        if (!sourceItemsPromise) {
            sourceItemsPromise = getSourceData().then((data) => {
                const collector = [];
                flattenData(data, [], collector);
                return collector;
            });
        }
        return (await sourceItemsPromise).map((item) => ({ ...item }));
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

        function decorateNode(node, path) {
            if (Array.isArray(node)) {
                return node.map((item) => {
                    const decorated = stockMap[getItemKey({ ...item, __path: path.join(' / ') })];
                    return decorated ? { ...decorated } : { ...item, currentStock: Number(item.stok || 0) };
                });
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
        const dailyCount = transactions.filter((transaction) => transaction.invoiceNumber.includes(datePart)).length + 1;
        return `INV-${datePart}-${String(dailyCount).padStart(3, '0')}`;
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

        const transactions = getSortedTransactions();
        const createdAt = new Date().toISOString();
        const transaction = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            invoiceNumber: buildInvoiceNumber(transactions, createdAt),
            createdAt,
            cashierName: payload.cashierName || 'Kasir',
            customerName: payload.customerName || 'Pelanggan Umum',
            notes: payload.notes || '',
            paymentAmount,
            total,
            changeAmount: paymentAmount - total,
            totalItems: lineItems.reduce((sum, item) => sum + item.qty, 0),
            totalCost: lineItems.reduce((sum, item) => sum + (item.qty * item.hargaPokok), 0),
            status: 'Lunas',
            items: lineItems
        };

        saveTransactions([transaction, ...transactions]);
        return transaction;
    }

    function deleteTransaction(transactionId) {
        const transactions = getTransactions();
        const nextTransactions = transactions.filter((transaction) => transaction.id !== transactionId);

        if (nextTransactions.length === transactions.length) {
            throw new Error('Transaksi yang ingin dihapus tidak ditemukan.');
        }

        saveTransactions(nextTransactions);
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
            createdAt: new Date().toISOString(),
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

    function getTransactionsInRange(startDate, endDate) {
        return getSortedTransactions().filter((transaction) => isTransactionInRange(transaction, startDate, endDate));
    }

    async function getDashboardSummary() {
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
            });
        });

        return {
            transactions,
            summary: {
                ...summary,
                labaKotor: summary.totalOmzet - summary.totalModal
            },
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
        getTransactions: getSortedTransactions,
        getTransactionsInRange,
        createTransaction,
        deleteTransaction,
        addStock,
        getDashboardSummary,
        getReport,
        clearTransactions
    };
})();