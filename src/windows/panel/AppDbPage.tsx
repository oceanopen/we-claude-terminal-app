import type { AppDbTableDump, AppDbTableInfo, AppDbValue } from '@src/shared/bindings';
import { Autorenew as AutorenewIcon } from '@mui/icons-material';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { commands } from '@src/shared/bindings';
import { unwrap } from '@src/shared/commands';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

type LoadStatus = 'loading' | 'ready' | 'error';
type ToastSeverity = 'success' | 'error';

// AutorenewIcon 旋转动画：刷新中持续旋转。两处刷新图标复用，避免重复 @keyframes。
function spinSx(spinning: boolean) {
  return {
    'animation': spinning ? 'spin 0.8s linear infinite' : undefined,
    '@keyframes spin': {
      from: { transform: 'rotate(0deg)' },
      to: { transform: 'rotate(360deg)' },
    },
  };
}

// 把一个 AppDbValue 渲染为可展示文本。null / blob 用 muted 灰色弱化，与有值单元格区分。
function renderCellValue(v: AppDbValue): { text: string; muted: boolean } {
  switch (v.kind) {
    case 'null':
      return { text: 'NULL', muted: true };
    case 'integer':
      return { text: String(v.value), muted: false };
    case 'real':
      // real 的 value 可能为 null（后端 NaN/Infinity 规整），按 NULL 处理。
      return v.value === null ? { text: 'NULL', muted: true } : { text: String(v.value), muted: false };
    case 'text':
      return { text: v.value, muted: false };
    case 'blob':
      return { text: `<blob ${v.bytes} B>`, muted: true };
  }
}

// panel 窗口「应用数据库」菜单页面：app.db 各表原始数据只读浏览。
// 左侧表列表 + 右侧选中表数据，各自独立刷新图标 / handler / 状态，互不影响；
// 刷新后弹 success/error toast（区分来源文案）。初次挂载的自动加载静默，不弹 toast。
function AppDbPage() {
  const { t } = useTranslation();
  const [tables, setTables] = useState<AppDbTableInfo[]>([]);
  const [tablesStatus, setTablesStatus] = useState<LoadStatus>('loading');
  const [selected, setSelected] = useState<string | null>(null);
  const [dump, setDump] = useState<AppDbTableDump | null>(null);
  const [dumpStatus, setDumpStatus] = useState<LoadStatus>('loading');
  const [refreshingTables, setRefreshingTables] = useState(false);
  const [refreshingDump, setRefreshingDump] = useState(false);
  // toast：toast 始终保留最近一次内容，toastOpen 控制显隐——退出动画期间内容不闪烁。
  const [toast, setToast] = useState<{ text: string; severity: ToastSeverity }>({ text: '', severity: 'success' });
  const [toastOpen, setToastOpen] = useState(false);

  const showToast = useCallback((text: string, severity: ToastSeverity) => {
    setToast({ text, severity });
    setToastOpen(true);
  }, []);

  // 返回 boolean 表达成败，供刷新 handler 决定 toast 文案。初次挂载调用忽略返回值。
  const loadTables = useCallback(async (): Promise<boolean> => {
    setTablesStatus('loading');
    try {
      setTables(await unwrap(commands.listAppDbTables()));
      setTablesStatus('ready');
      return true;
    } catch {
      setTablesStatus('error');
      return false;
    }
  }, []);

  const loadDump = useCallback(async (table: string): Promise<boolean> => {
    setDumpStatus('loading');
    try {
      setDump(await unwrap(commands.dumpAppDbTable(table)));
      setDumpStatus('ready');
      return true;
    } catch {
      setDumpStatus('error');
      return false;
    }
  }, []);

  // 初次加载表列表（静默，不弹 toast）。
  useEffect(() => {
    void loadTables();
  }, [loadTables]);

  // 表列表变化后保证选中项有效：缺失或已失效（被删）时回落到首张表。
  // 在渲染期间调整 state（React 推荐的「依赖变化时重置 state」模式，避免 effect 内 setState）。
  const [prevTables, setPrevTables] = useState(tables);
  if (tables !== prevTables) {
    setPrevTables(tables);
    if (!selected || !tables.some(tb => tb.name === selected)) {
      setSelected(tables[0]?.name ?? null);
    }
  }

  // 选中表变化 → 加载其原始数据（静默）。
  useEffect(() => {
    if (selected) {
      void loadDump(selected);
    }
  }, [selected, loadDump]);

  // 仅刷新表列表，成功/失败弹区分来源的 toast。
  const handleRefreshTables = useCallback(async () => {
    setRefreshingTables(true);
    const ok = await loadTables();
    setRefreshingTables(false);
    showToast(
      ok ? t('panel:appDb.refreshTablesSuccess') : t('panel:appDb.refreshTablesFail'),
      ok ? 'success' : 'error',
    );
  }, [loadTables, showToast, t]);

  // 仅刷新当前表数据，成功/失败弹区分来源的 toast。无选中表时不执行。
  const handleRefreshDump = useCallback(async () => {
    if (!selected) {
      return;
    }
    setRefreshingDump(true);
    const ok = await loadDump(selected);
    setRefreshingDump(false);
    showToast(
      ok ? t('panel:appDb.refreshDumpSuccess') : t('panel:appDb.refreshDumpFail'),
      ok ? 'success' : 'error',
    );
  }, [loadDump, selected, showToast, t]);

  // 行稳定 key：首列值做主键（多数表首列为 id/主键），行号兜底唯一性。
  // 用计算字符串作 key，避免静态只读表的 no-array-index-key 误报。
  const rowKey = useCallback((row: AppDbValue[], fallback: number): string => {
    const head = row[0] ? renderCellValue(row[0]).text : '';
    return `${head}#${fallback}`;
  }, []);

  return (
    <Box sx={{ height: '100%', display: 'flex' }}>
      {/* 左侧：表列表 */}
      <Box
        sx={{
          width: 220,
          flexShrink: 0,
          borderRight: 1,
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            p: 1.5,
            borderBottom: 1,
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {t('panel:appDb.tables', { count: tables.length })}
          </Typography>
          <Box sx={{ flex: 1 }} />
          <IconButton
            size="small"
            onClick={handleRefreshTables}
            disabled={refreshingTables}
            aria-label="refresh tables"
          >
            <AutorenewIcon sx={spinSx(refreshingTables)} />
          </IconButton>
        </Box>
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {tablesStatus === 'loading' && (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
              <CircularProgress size={20} />
            </Box>
          )}
          {tablesStatus === 'error' && (
            <Box sx={{ p: 1 }}>
              <Button size="small" onClick={loadTables}>
                {t('panel:appDb.retry')}
              </Button>
            </Box>
          )}
          {tablesStatus === 'ready' && (
            <List dense disablePadding>
              {tables.map(table => (
                <ListItemButton
                  key={table.name}
                  selected={selected === table.name}
                  onClick={() => setSelected(table.name)}
                  sx={{
                    'pl': 2,
                    'pr': 1,
                    '& .MuiListItemText-primary': {
                      fontWeight: 600,
                      fontSize: '0.8125rem',
                      whiteSpace: 'nowrap',
                    },
                  }}
                >
                  <ListItemText primary={table.name} />
                  {/* rowCount < 0：非常规表名，后端未统计行数，显示 ? 占位。 */}
                  <Chip
                    label={table.rowCount < 0 ? '?' : table.rowCount}
                    size="small"
                    sx={{ height: 18, fontSize: '0.7rem', bgcolor: 'action.hover' }}
                  />
                </ListItemButton>
              ))}
            </List>
          )}
        </Box>
      </Box>

      {/* 右侧：选中表原始数据 */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Box
          sx={{
            p: 2,
            borderBottom: 1,
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
            {selected ?? t('panel:appDb.noSelection')}
          </Typography>
          {selected && dump && dumpStatus === 'ready' && (
            <Chip
              label={t('panel:appDb.rowCount', { count: dump.rows.length })}
              size="small"
              sx={{ bgcolor: 'action.hover' }}
            />
          )}
          <Box sx={{ flex: 1 }} />
          <IconButton
            size="small"
            onClick={handleRefreshDump}
            disabled={!selected || refreshingDump}
            aria-label="refresh data"
          >
            <AutorenewIcon sx={spinSx(refreshingDump)} />
          </IconButton>
        </Box>
        <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {!selected && (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <Typography variant="body2" color="text.secondary">
                {t('panel:appDb.noTables')}
              </Typography>
            </Box>
          )}
          {selected && dumpStatus === 'loading' && (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <CircularProgress />
            </Box>
          )}
          {selected && dumpStatus === 'error' && (
            <Box sx={{ p: 2 }}>
              <Alert
                severity="error"
                action={(
                  <Button color="inherit" size="small" onClick={() => selected && loadDump(selected)}>
                    {t('panel:appDb.retry')}
                  </Button>
                )}
              >
                <AlertTitle>{t('panel:appDb.errorTitle')}</AlertTitle>
                {t('panel:appDb.errorDesc')}
              </Alert>
            </Box>
          )}
          {selected && dumpStatus === 'ready' && dump && dump.rows.length === 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <Typography variant="body2" color="text.secondary">
                {t('panel:appDb.emptyRows')}
              </Typography>
            </Box>
          )}
          {selected && dumpStatus === 'ready' && dump && dump.rows.length > 0 && (
            // TableContainer 作为滚动容器（双向 overflow），stickyHeader 吸附其顶部。
            <TableContainer sx={{ height: '100%', overflow: 'auto' }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    {dump.columns.map(col => (
                      <TableCell
                        key={col}
                        sx={{ fontWeight: 700, whiteSpace: 'nowrap', bgcolor: 'background.paper' }}
                      >
                        {col}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {dump.rows.map((row, ri) => (
                    <TableRow key={rowKey(row, ri)} hover>
                      {row.map((cell, ci) => {
                        const { text, muted } = renderCellValue(cell);
                        return (
                          <TableCell
                            key={dump.columns[ci]}
                            title={text}
                            sx={{ color: muted ? 'text.disabled' : 'text.primary', verticalAlign: 'top' }}
                          >
                            {/* Box 截断长值（如 sub_dir_list 的 JSON 文本 / 目录路径），title 悬浮查看全量。 */}
                            <Box
                              sx={{
                                maxWidth: 360,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {text}
                            </Box>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      </Box>

      {/* 刷新反馈 toast：success 绿 / error 红，区分来源文案。 */}
      <Snackbar
        open={toastOpen}
        autoHideDuration={1000}
        onClose={() => setToastOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={toast.severity} variant="filled">
          {toast.text}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default AppDbPage;
