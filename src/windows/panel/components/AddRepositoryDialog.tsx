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

// 添加/编辑本地仓库弹窗。
// 传入 repo 时为编辑模式：标题改为"编辑仓库"、ID 只读展示、name/dir 默认反显、
// 提交调用 updateRepository；不传则为添加模式，行为不变。
//
// 由父组件按需挂载（{open && <AddRepositoryDialog/>}）：每次打开都是全新 useState 初值，
// 无需重置 effect；关闭即卸载。
interface AddRepositoryDialogProps {
  onClose: () => void;
  onAdded: (repo: Repository) => void;
  onUpdated?: (repo: Repository) => void;
  repo?: Repository;
}

function AddRepositoryDialog({ onClose, onAdded, onUpdated, repo }: AddRepositoryDialogProps) {
  const { t } = useTranslation();
  const isEdit = !!repo;
  const [name, setName] = useState(repo?.name ?? '');
  const [dir, setDir] = useState(repo?.dir ?? '');
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
      if (isEdit && repo) {
        const updated = await unwrap(commands.updateRepository(repo.id, name.trim(), dir.trim()));
        onUpdated?.(updated);
      } else {
        const added = await unwrap(commands.addRepository(name.trim(), dir.trim()));
        onAdded(added);
      }
      onClose();
    } catch (e) {
      // 后端哨兵字符串 → i18n 文案；未知错误带原始信息。
      const err = String(e);
      if (err === 'not-a-git-repo') {
        setError(t('repositories:toast.notGitRepo'));
      } else if (err === 'dir-exists') {
        setError(t('repositories:toast.dirExists'));
      } else if (isEdit) {
        setError(t('repositories:toast.updateFailed', { message: err }));
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
      <DialogTitle>{isEdit ? t('repositories:edit.title') : t('repositories:add.title')}</DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 0.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {isEdit && (
            <TextField
              label={t('repositories:edit.idLabel')}
              value={repo!.id}
              fullWidth
              slotProps={{ input: { readOnly: true } }}
              variant="filled"
            />
          )}
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
          {isEdit ? t('repositories:edit.confirm') : t('repositories:add.confirm')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default AddRepositoryDialog;
