import type { Repository } from '@src/shared/bindings';
import { FolderOpen as FolderOpenIcon } from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  TextField,
} from '@mui/material';
import { commands } from '@src/shared/bindings';
import { unwrap } from '@src/shared/commands';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

// 添加本地仓库弹窗（项目首个 Dialog 用法）。
// 名称 + 目录（目录带「浏览」按钮调系统文件夹选择器），提交时后端严格校验
// （目录须存在且为 git 仓库），失败以内联 Alert 展示错误信息并保留弹窗供用户修正。
// 成功后回调 onAdded(repo) 由父组件刷新列表 + toast，并关闭弹窗。
//
// 由父组件按需挂载（{open && <AddRepositoryDialog/>}）：每次打开都是全新 useState 初值，
// 无需重置 effect；关闭即卸载。
interface AddRepositoryDialogProps {
  onClose: () => void;
  onAdded: (repo: Repository) => void;
}

function AddRepositoryDialog({ onClose, onAdded }: AddRepositoryDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [dir, setDir] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBrowse = async () => {
    // directory: true 多选关闭，返回 string | null。
    const selected = await openDialog({ directory: true, multiple: false });
    if (typeof selected === 'string') {
      setDir(selected);
      setError(null);
    }
  };

  const canSubmit = name.trim().length > 0 && dir.trim().length > 0 && !submitting;

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const repo = await unwrap(commands.addRepository(name.trim(), dir.trim()));
      onAdded(repo);
      onClose();
    } catch (e) {
      // 后端哨兵字符串 → i18n 文案；未知错误带原始信息。
      const err = String(e);
      if (err === 'not-a-git-repo') {
        setError(t('repositories:toast.notGitRepo'));
      } else if (err === 'dir-exists') {
        setError(t('repositories:toast.dirExists'));
      } else {
        setError(t('repositories:toast.addFailed', { message: err }));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open
      // 提交中禁止背景点击/Esc 关闭，避免半成品状态丢失。
      onClose={submitting ? undefined : onClose}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>{t('repositories:add.title')}</DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 0.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            label={t('repositories:add.name')}
            placeholder={t('repositories:add.namePlaceholder')}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            fullWidth
            autoFocus
            disabled={submitting}
          />
          <TextField
            label={t('repositories:add.dir')}
            placeholder={t('repositories:add.dirPlaceholder')}
            value={dir}
            onChange={(e) => {
              setDir(e.target.value);
              setError(null);
            }}
            fullWidth
            disabled={submitting}
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      edge="end"
                      onClick={handleBrowse}
                      disabled={submitting}
                      aria-label={t('repositories:add.browse')}
                    >
                      <FolderOpenIcon />
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />
          {error && <Alert severity="error">{error}</Alert>}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose} disabled={submitting}>
          {t('repositories:add.cancel')}
        </Button>
        <Button variant="contained" onClick={handleConfirm} disabled={!canSubmit}>
          {t('repositories:add.confirm')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default AddRepositoryDialog;
