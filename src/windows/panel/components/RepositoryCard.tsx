import type { Repository } from '@src/shared/bindings';
import type { ReactNode } from 'react';
import { SiIntellijidea, SiIterm2 } from '@icons-pack/react-simple-icons';
import {
  AccountTree as AccountTreeIcon,
  Autorenew as AutorenewIcon,
  CloudOutlined as CloudOutlinedIcon,
  DeleteOutlined as DeleteOutlinedIcon,
  EditOutlined as EditOutlinedIcon,
  FolderOutlined as FolderOutlinedIcon,
  HistoryOutlined as HistoryOutlinedIcon,
} from '@mui/icons-material';
import { Box, Button, Card, CardActions, CardContent, CardHeader, Chip, Divider, IconButton, Link, Typography } from '@mui/material';
import vscodeIconSvg from '@src/assets/vscode.svg?raw';
import { commands } from '@src/shared/bindings';
import { unwrap } from '@src/shared/commands';
import { formatDate, formatRelativeTime } from '@src/shared/time';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const truncateSx = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

// VSCode 官方单色品牌图标（src/assets/vscode.svg 通过 ?raw 注入，保留 currentColor 主题色跟随；同 ClaudeSessionCard）。
function VsCodeIcon() {
  return (
    <span
      style={{ display: 'inline-flex', width: '1.25rem', height: '1.25rem' }}
      // eslint-disable-next-line react/dom-no-dangerously-set-innerhtml -- 注入项目内静态 SVG 字符串，非外部输入，无 XSS 风险
      dangerouslySetInnerHTML={{ __html: vscodeIconSvg }}
    />
  );
}

// 单卡片：Header 仓库名 + 刷新/编辑/删除；Content 系统目录(点击打开)/仓库地址/当前分支/最近提交；Actions 左下 VSCode/IDEA、右下 iTerm2。
// 卡片 height:100% + flex column，保证网格内同行卡片高度对齐、操作栏贴底。
interface RepositoryCardProps {
  repo: Repository;
  refreshing: boolean;
  onOpenFolder: (repo: Repository) => void;
  onOpenInTerminal: (repo: Repository, terminal: 'iterm2' | 'terminal') => void;
  onRefresh: (repo: Repository) => void;
  onEdit: (repo: Repository) => void;
  onDelete: (repo: Repository) => void;
}

function InfoRow({ icon, label, children }: { icon: ReactNode; label?: string; children: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
      <Box
        sx={{
          width: 18,
          flexShrink: 0,
          color: 'text.disabled',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        {icon}
      </Box>
      {label && (
        <Typography variant="caption" sx={{ color: 'text.disabled', flexShrink: 0, minWidth: 50 }}>
          {label}
        </Typography>
      )}
      {/* minWidth:0 让 flex 子项内文本 ellipsis 生效 */}
      <Box sx={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'flex-start' }}>{children}</Box>
    </Box>
  );
}

function RepositoryCard({ repo, refreshing, onOpenFolder, onOpenInTerminal, onRefresh, onEdit, onDelete }: RepositoryCardProps) {
  const { t } = useTranslation();
  const hasRemote = repo.remoteUrl.length > 0;
  const hasBranch = repo.branch.length > 0;
  const hasCommit = repo.lastCommitAt > 0;

  // Java 项目判断（pom.xml / build.gradle / build.gradle.kts）：
  // 决定 VSCode/IDEA 哪个禁用——Java 项目优先 IDEA，其他优先 VSCode（同 ClaudeSessionCard）。
  // 命令返回裸 Promise<boolean>（非 typedError），错误时 fallback false（按非 Java 处理）。
  const [isJava, setIsJava] = useState(false);
  useEffect(() => {
    commands.isJavaProject(repo.dir)
      .then(setIsJava)
      .catch(() => setIsJava(false));
  }, [repo.dir]);

  // 编辑器打开：失败时静默 warn（编辑器未装的常见场景，不值得用 toast 打断；同 ClaudeSessionCard）。
  const handleOpenInEditor = useCallback((editor: 'vscode' | 'idea') => {
    unwrap(commands.openInEditor(editor, repo.dir)).catch((e) => {
      console.warn(`[repositories] openInEditor(${editor}) failed`, e);
    });
  }, [repo.dir]);

  return (
    <Card variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardHeader
        title={repo.name}
        slotProps={{ title: { fontWeight: 600, noWrap: true } }}
        action={(
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <IconButton
              size="small"
              onClick={() => onRefresh(repo)}
              disabled={refreshing}
              aria-label={t('repositories:card.refresh')}
            >
              <AutorenewIcon
                sx={{
                  'animation': refreshing ? 'spin 0.8s linear infinite' : undefined,
                  '@keyframes spin': {
                    from: { transform: 'rotate(0deg)' },
                    to: { transform: 'rotate(360deg)' },
                  },
                }}
              />
            </IconButton>
            <IconButton size="small" onClick={() => onEdit(repo)} aria-label={t('repositories:card.edit')}>
              <EditOutlinedIcon />
            </IconButton>
            <IconButton size="small" onClick={() => onDelete(repo)} aria-label={t('repositories:card.delete')}>
              <DeleteOutlinedIcon />
            </IconButton>
          </Box>
        )}
        sx={{ '& .MuiCardHeader-action': { alignSelf: 'center', mt: 0 } }}
      />
      <Divider />
      <CardContent sx={{ flex: 1 }}>
        <InfoRow icon={<FolderOutlinedIcon sx={{ fontSize: '0.95rem' }} />} label={t('repositories:card.dirLabel')}>
          <Link
            component="button"
            type="button"
            onClick={() => onOpenFolder(repo)}
            title={repo.dir}
            underline="hover"
            sx={{
              fontFamily: 'monospace',
              fontSize: '0.75rem',
              textAlign: 'left',
              display: 'block',
              width: '100%',
              minWidth: 0,
              ...truncateSx,
            }}
          >
            {repo.dir}
          </Link>
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
                <Typography variant="caption" sx={{ color: 'text.disabled' }}>
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
      <CardActions sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            size="small"
            disabled={isJava}
            onClick={() => handleOpenInEditor('vscode')}
            startIcon={<VsCodeIcon />}
          >
            {t('repositories:card.vscode')}
          </Button>
          <Button
            size="small"
            disabled={!isJava}
            onClick={() => handleOpenInEditor('idea')}
            startIcon={<SiIntellijidea size="1.15rem" color="currentColor" />}
          >
            {t('repositories:card.idea')}
          </Button>
        </Box>
        <Button size="small" onClick={() => onOpenInTerminal(repo, 'iterm2')} startIcon={<SiIterm2 size="1.25rem" color="currentColor" />}>
          {t('repositories:card.iTerm2')}
        </Button>
      </CardActions>
    </Card>
  );
}

export default RepositoryCard;
