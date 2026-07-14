import type { Repository } from '@src/shared/bindings';
import type { ReactNode } from 'react';
import {
  AccountTree as AccountTreeIcon,
  CloudOutlined as CloudOutlinedIcon,
  DeleteOutlined as DeleteOutlinedIcon,
  FolderOpenOutlined as FolderOpenOutlinedIcon,
  FolderOutlined as FolderOutlinedIcon,
  HistoryOutlined as HistoryOutlinedIcon,
  RefreshOutlined as RefreshOutlinedIcon,
} from '@mui/icons-material';
import { Box, Button, Card, CardActions, CardContent, CardHeader, Chip, Divider, IconButton, Typography } from '@mui/material';
import { formatDate, formatRelativeTime } from '@src/shared/time';
import { useTranslation } from 'react-i18next';

const truncateSx = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

// 单卡片：Header 仓库名；Content 目录/远程/分支/最近提交；Actions 左「在文件夹中打开」+ 右刷新/删除。
// 卡片 height:100% + flex column，保证网格内同行卡片高度对齐、操作栏贴底。
interface RepositoryCardProps {
  repo: Repository;
  refreshing: boolean;
  onOpenFolder: (repo: Repository) => void;
  onRefresh: (repo: Repository) => void;
  onDelete: (repo: Repository) => void;
}

function InfoRow({ icon, label, children }: { icon: ReactNode; label?: string; children: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
      <Box
        sx={{
          width: 18,
          flexShrink: 0,
          color: 'text.secondary',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        {icon}
      </Box>
      {label && (
        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
          {label}
        </Typography>
      )}
      {/* minWidth:0 让 flex 子项内文本 ellipsis 生效 */}
      <Box sx={{ minWidth: 0, flex: 1 }}>{children}</Box>
    </Box>
  );
}

function RepositoryCard({ repo, refreshing, onOpenFolder, onRefresh, onDelete }: RepositoryCardProps) {
  const { t } = useTranslation();
  const hasRemote = repo.remoteUrl.length > 0;
  const hasBranch = repo.branch.length > 0;
  const hasCommit = repo.lastCommitAt > 0;

  return (
    <Card variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardHeader
        title={repo.name}
        slotProps={{ title: { fontWeight: 600, noWrap: true } }}
        sx={{ '& .MuiCardHeader-action': { alignSelf: 'center', mt: 0 } }}
      />
      <Divider />
      <CardContent sx={{ flex: 1 }}>
        <InfoRow icon={<FolderOutlinedIcon sx={{ fontSize: '0.95rem' }} />}>
          <Typography sx={{ fontFamily: 'monospace', fontSize: '0.75rem', ...truncateSx }} title={repo.dir}>
            {repo.dir}
          </Typography>
        </InfoRow>

        <InfoRow icon={<CloudOutlinedIcon sx={{ fontSize: '0.95rem' }} />} label={t('repositories:card.remoteLabel')}>
          <Typography variant="caption" sx={{ ...truncateSx, color: hasRemote ? 'text.primary' : 'text.disabled' }} title={repo.remoteUrl}>
            {hasRemote ? repo.remoteUrl : t('repositories:card.noRemote')}
          </Typography>
        </InfoRow>

        <InfoRow icon={<AccountTreeIcon sx={{ fontSize: '0.95rem' }} />} label={t('repositories:card.branchLabel')}>
          {hasBranch
            ? (
                <Chip size="small" variant="outlined" label={repo.branch} />
              )
            : (
                <Typography variant="caption" color="text.disabled">
                  {t('repositories:card.noBranch')}
                </Typography>
              )}
        </InfoRow>

        <InfoRow icon={<HistoryOutlinedIcon sx={{ fontSize: '0.95rem' }} />} label={t('repositories:card.commitLabel')}>
          <Typography variant="caption" sx={{ color: hasCommit ? 'text.secondary' : 'text.disabled' }}>
            {hasCommit
              ? `${formatRelativeTime(repo.lastCommitAt, t, 'repositories')} | ${formatDate(repo.lastCommitAt, 'YYYY-MM-DD HH:mm:ss')}`
              : t('repositories:card.noCommit')}
          </Typography>
        </InfoRow>
      </CardContent>
      <Divider />
      <CardActions sx={{ justifyContent: 'space-between' }}>
        <Button size="small" onClick={() => onOpenFolder(repo)} startIcon={<FolderOpenOutlinedIcon />}>
          {t('repositories:card.openFolder')}
        </Button>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <IconButton
            size="small"
            onClick={() => onRefresh(repo)}
            disabled={refreshing}
            aria-label={t('repositories:card.refresh')}
          >
            <RefreshOutlinedIcon
              sx={{
                'animation': refreshing ? 'spin 0.8s linear infinite' : undefined,
                '@keyframes spin': {
                  from: { transform: 'rotate(0deg)' },
                  to: { transform: 'rotate(360deg)' },
                },
              }}
            />
          </IconButton>
          <IconButton size="small" onClick={() => onDelete(repo)} aria-label={t('repositories:card.delete')}>
            <DeleteOutlinedIcon />
          </IconButton>
        </Box>
      </CardActions>
    </Card>
  );
}

export default RepositoryCard;
