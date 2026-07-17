
    (async () => {
        const store = window.EnrekangStore;
        const metricsContainer = document.getElementById('dashboard-metrics');
        const lowStockContent = document.getElementById('dashboard-low-stock-content');
        const topProductsContainer = document.getElementById('dashboard-top-products');
        const activitiesContainer = document.getElementById('dashboard-activities');
        const axisYContainer = document.getElementById('dashboard-axis-y');
        const monthsContainer = document.getElementById('dashboard-chart-months');
        const chartSvg = document.getElementById('dashboard-chart-svg');
        const tooltip = document.getElementById('dashboard-tooltip');
        const showMonthlyDetailButton = document.getElementById('dashboard-show-monthly-detail');
        const showLowStockButton = document.getElementById('dashboard-show-low-stock');
        const detailModal = document.getElementById('dashboard-detail-modal');
        const detailCloseButton = document.getElementById('dashboard-detail-close');
        const detailYearSelect = document.getElementById('dashboard-detail-year');
        const detailSummary = document.getElementById('dashboard-detail-summary');
        const detailAxisY = document.getElementById('dashboard-detail-axis-y');
        const detailMonths = document.getElementById('dashboard-detail-chart-months');
        const detailChartSvg = document.getElementById('dashboard-detail-chart-svg');
        const detailTooltip = document.getElementById('dashboard-detail-tooltip');
        const detailTableBody = document.getElementById('dashboard-detail-table-body');
        const dashboardState = {
            transactions: [],
            availableYears: [],
            selectedYear: new Date().getFullYear()
        };

        const escapeHtml = (value) => String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

        const formatCompact = (value) => {
            const amount = Number(value || 0);
            if (amount >= 1000000) {
                return `Rp ${(amount / 1000000).toFixed(1).replace('.0', '')} Jt`;
            }
            if (amount >= 1000) {
                return `Rp ${(amount / 1000).toFixed(0)} Rb`;
            }
            return `Rp ${amount}`;
        };

        const buildMonthSeries = (transactions, year) => {
            const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
            const totals = new Array(12).fill(0);

            transactions.forEach((transaction) => {
                const date = new Date(transaction.createdAt);
                if (Number.isNaN(date.getTime()) || date.getFullYear() !== year) {
                    return;
                }
                totals[date.getMonth()] += Number(transaction.total || 0);
            });

            return labels.map((label, index) => ({ label, value: totals[index] }));
        };

        const positionTooltip = (tooltipElement, svgElement, point) => {
            const viewBox = svgElement.viewBox.baseVal;
            const scaleX = svgElement.clientWidth / viewBox.width;
            const scaleY = svgElement.clientHeight / viewBox.height;
            const pointX = point.x * scaleX;
            const pointY = point.y * scaleY;
            tooltipElement.style.left = `${pointX}px`;
            tooltipElement.style.top = `${Math.max(18, pointY - 12)}px`;
        };

        const renderChart = (series, options = {}) => {
            const {
                axisContainer = axisYContainer,
                monthsNode = monthsContainer,
                svgNode = chartSvg,
                tooltipNode = tooltip,
                year = new Date().getFullYear()
            } = options;
            const maxValue = Math.max(...series.map(item => item.value), 1);
            const roundedMax = Math.ceil(maxValue / 1000000) * 1000000;
            const stepValue = Math.max(roundedMax / 5, 1);

            axisContainer.innerHTML = [5, 4, 3, 2, 1, 0].map(step => `<span>${formatCompact(step * stepValue)}</span>`).join('');
            monthsNode.innerHTML = series.map(item => `<span>${item.label}</span>`).join('');

            const pointGap = 720 / (series.length - 1);
            const points = series.map((item, index) => {
                const x = index * pointGap;
                const y = 208 - ((item.value / (stepValue * 5)) * 180);
                return { ...item, x, y: Number.isFinite(y) ? y : 208 };
            });

            const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
            svgNode.innerHTML = `
                <path d="${linePath}" fill="none" stroke="#7a4f2f" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></path>
                ${points.map(point => `
                    <g class="chart-point" data-label="${point.label}" data-value="${store.formatRupiah(point.value)}" data-x="${point.x}" data-y="${point.y}">
                        <circle cx="${point.x}" cy="${point.y}" r="7" fill="#7a4f2f"></circle>
                        <circle cx="${point.x}" cy="${point.y}" r="13" fill="rgba(122, 79, 47, 0.12)"></circle>
                    </g>
                `).join('')}
            `;

            svgNode.querySelectorAll('.chart-point').forEach(point => {
                point.addEventListener('mouseenter', () => {
                    const pointData = {
                        x: Number(point.dataset.x || 0),
                        y: Number(point.dataset.y || 0)
                    };
                    tooltipNode.innerHTML = `<strong>${point.dataset.label} ${year}</strong><br>${point.dataset.value}`;
                    positionTooltip(tooltipNode, svgNode, pointData);
                    tooltipNode.classList.add('active');
                });
                point.addEventListener('mouseleave', () => {
                    tooltipNode.classList.remove('active');
                });
            });
        };

        const renderMonthlyDetail = () => {
            const year = Number(detailYearSelect.value || dashboardState.selectedYear);
            dashboardState.selectedYear = year;
            const series = buildMonthSeries(dashboardState.transactions, year);
            const totalYearSales = series.reduce((sum, item) => sum + item.value, 0);

            detailSummary.textContent = `Total ${year}: ${store.formatRupiah(totalYearSales)}`;
            detailTableBody.innerHTML = series.map((item) => `
                <tr>
                    <td>${item.label} ${year}</td>
                    <td>${store.formatRupiah(item.value)}</td>
                </tr>
            `).join('');

            renderChart(series, {
                axisContainer: detailAxisY,
                monthsNode: detailMonths,
                svgNode: detailChartSvg,
                tooltipNode: detailTooltip,
                year
            });
        };

        const openMonthlyDetail = () => {
            detailModal.classList.add('is-open');
            detailModal.setAttribute('aria-hidden', 'false');
            renderMonthlyDetail();
        };

        const closeMonthlyDetail = () => {
            detailModal.classList.remove('is-open');
            detailModal.setAttribute('aria-hidden', 'true');
        };

        const renderLowStockTable = (items) => {
            if (!items.length) {
                lowStockContent.innerHTML = '<div class="dashboard-empty">Tidak ada barang dengan stok menipis saat ini.</div>';
                return;
            }

            lowStockContent.innerHTML = `
                <div style="overflow-x:auto;">
                    <table class="dashboard-low-stock-table">
                        <thead>
                            <tr>
                                <th>Produk</th>
                                <th>Kategori</th>
                                <th>Stok Tersisa</th>
                                <th>Batas Minimum</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${items.slice(0, 5).map(item => `
                                <tr>
                                    <td>${escapeHtml(item.namaItem || '-')}</td>
                                    <td>${escapeHtml(item.__kategori || item.__lokasi || '-')}</td>
                                    <td>${escapeHtml(String(item.currentStock || 0))}</td>
                                    <td>5</td>
                                    <td><span class="dashboard-status-pill ${Number(item.currentStock || 0) <= 2 ? 'danger' : 'warning'}">${Number(item.currentStock || 0) <= 2 ? 'Hampir Habis' : 'Stok Rendah'}</span></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        };

        try {
            const [summary, transactions, report, effectiveItems] = await Promise.all([
                store.getDashboardSummary(),
                Promise.resolve(store.getTransactions()),
                store.getReport('', ''),
                store.getEffectiveItems()
            ]);
            dashboardState.transactions = transactions;
            dashboardState.availableYears = Array.from(new Set(transactions
                .map((transaction) => new Date(transaction.createdAt))
                .filter((date) => !Number.isNaN(date.getTime()))
                .map((date) => date.getFullYear())))
                .sort((left, right) => right - left);
            if (!dashboardState.availableYears.length) {
                dashboardState.availableYears = [new Date().getFullYear()];
            }
            detailYearSelect.innerHTML = dashboardState.availableYears
                .map((year) => `<option value="${year}">${year}</option>`)
                .join('');
            dashboardState.selectedYear = dashboardState.availableYears[0];
            const customerCount = new Set(transactions.map(transaction => (transaction.customerName || 'Pelanggan Umum').trim()).filter(Boolean)).size;
            const monthSeries = buildMonthSeries(transactions, new Date().getFullYear());

            metricsContainer.innerHTML = [
                {
                    title: 'Total Produk',
                    value: summary.totalProduk,
                    note: 'Produk aktif',
                    icon: 'fa-box',
                    iconStyle: 'background:#f6eee3;color:#8a5a34;'
                },
                {
                    title: 'Penjualan Hari Ini',
                    value: store.formatRupiah(summary.penjualanHariIni),
                    note: `${summary.transaksiHariIni} transaksi`,
                    icon: 'fa-cart-shopping',
                    iconStyle: 'background:#fdeceb;color:#e05a47;'
                },
                {
                    title: 'Total Pelanggan',
                    value: customerCount,
                    note: 'Pelanggan tercatat',
                    icon: 'fa-users',
                    iconStyle: 'background:#e8f7ee;color:#2a8b57;'
                },
                {
                    title: 'Stok Menipis',
                    value: summary.stokMenipis,
                    note: 'Produk perlu restock',
                    action: 'low-stock',
                    icon: 'fa-box-open',
                    iconStyle: 'background:#fff2d8;color:#ba7b12;'
                }
            ].map(card => `
                <div class="dashboard-card ${card.action ? 'is-clickable' : ''}" ${card.action ? `data-action="${card.action}"` : ''}>
                    <div class="dashboard-card-icon" style="${card.iconStyle}"><i class="fas ${card.icon}"></i></div>
                    <div>
                        <h4>${card.title}</h4>
                        <strong>${card.value}</strong>
                        <span>${card.note}</span>
                    </div>
                </div>
            `).join('');

            renderChart(monthSeries, { year: new Date().getFullYear() });
            renderLowStockTable(summary.lowStockItems || []);

            if (!report.topItems.length) {
                topProductsContainer.innerHTML = '<div class="dashboard-empty">Belum ada produk terlaris karena transaksi masih kosong.</div>';
            } else {
                const highestQty = Math.max(...report.topItems.slice(0, 5).map(item => Number(item.qty || 0)), 1);
                topProductsContainer.innerHTML = report.topItems.slice(0, 5).map((item, index) => `
                    <div class="dashboard-product-row">
                        <span class="dashboard-rank ${index === 0 ? 'is-top' : ''}">${index + 1}</span>
                        <div class="dashboard-product-meta">
                            <div class="dashboard-product-name">${escapeHtml(item.namaItem || '-')}</div>
                            <div class="dashboard-progress"><span style="width:${Math.max(16, Math.round((Number(item.qty || 0) / highestQty) * 100))}%;"></span></div>
                        </div>
                        <div class="dashboard-product-value">${escapeHtml(String(item.qty || 0))} Terjual</div>
                    </div>
                `).join('');
            }

            const activityItems = [
                ...summary.lowStockItems.slice(0, 2).map(item => ({
                    type: 'stock-alert',
                    createdAt: new Date().toISOString(),
                    title: 'Notifikasi stok minimum',
                    detail: `${item.namaItem} tersisa ${item.currentStock} pcs`,
                    role: 'Admin'
                })),
                ...summary.transaksiTerbaru.map(transaction => ({
                    type: 'transaction',
                    createdAt: transaction.createdAt,
                    title: `Transaksi #${transaction.invoiceNumber} berhasil`,
                    detail: `Total ${store.formatRupiah(transaction.total)}`,
                    role: transaction.cashierName || 'Kasir'
                })),
                ...effectiveItems.filter(item => Number(item.stokTambahan || 0) > 0).slice(0, 2).map(item => ({
                    type: 'stock-in',
                    createdAt: new Date().toISOString(),
                    title: 'Stok masuk dicatat',
                    detail: `${item.namaItem} + ${item.stokTambahan} pcs`,
                    role: 'Admin'
                }))
            ].sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt)).slice(0, 5);

            if (!activityItems.length) {
                activitiesContainer.innerHTML = '<div class="dashboard-empty">Belum ada aktivitas terbaru.</div>';
            } else {
                const activityMeta = {
                    transaction: { icon: 'fa-cart-shopping', bg: '#edf4ff', color: '#3368bf' },
                    'stock-in': { icon: 'fa-box', bg: '#e8f7ee', color: '#2a8b57' },
                    'stock-alert': { icon: 'fa-arrow-down', bg: '#fdeceb', color: '#c95145' }
                };

                activitiesContainer.innerHTML = activityItems.map(activity => {
                    const meta = activityMeta[activity.type] || activityMeta.transaction;
                    const time = new Date(activity.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
                    return `
                        <div class="dashboard-activity-item">
                            <div class="dashboard-activity-time">${time}</div>
                            <div class="dashboard-activity-icon" style="background:${meta.bg};color:${meta.color};"><i class="fas ${meta.icon}"></i></div>
                            <div class="dashboard-activity-copy">
                                <strong>${escapeHtml(activity.title)}</strong>
                                <small>${escapeHtml(activity.detail)}</small>
                            </div>
                            <span class="dashboard-role-pill">${escapeHtml(activity.role)}</span>
                        </div>
                    `;
                }).join('');
            }

            metricsContainer.addEventListener('click', (event) => {
                const card = event.target.closest('[data-action="low-stock"]');
                if (!card) {
                    return;
                }
                showLowStockButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });

            showLowStockButton.addEventListener('click', () => {
                lowStockContent.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });

            showMonthlyDetailButton.addEventListener('click', openMonthlyDetail);
            detailCloseButton.addEventListener('click', closeMonthlyDetail);
            detailYearSelect.addEventListener('change', renderMonthlyDetail);
            detailModal.addEventListener('click', (event) => {
                if (event.target === detailModal) {
                    closeMonthlyDetail();
                }
            });
        } catch (error) {
            metricsContainer.innerHTML = `<div class="dashboard-card"><h4>Error</h4><strong>Gagal</strong><span>${error.message}</span></div>`;
            topProductsContainer.innerHTML = '';
            activitiesContainer.innerHTML = '';
            lowStockContent.innerHTML = '';
        }
    })();
