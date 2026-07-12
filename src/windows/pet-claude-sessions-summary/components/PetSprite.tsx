import type { SvgIconComponent } from '@mui/icons-material';
import type { ClaudeSessionStatus } from '@src/shared/bindings';
import { Autorenew, Bedtime, Notifications, Schedule } from '@mui/icons-material';
import { Box } from '@mui/material';
import { STATUS_COLOR } from '@src/shared/sessionStatus';

interface PetSpriteProps {
  status: ClaudeSessionStatus;
  count: number;
}

// 4 种状态对应 MUI Icon（SVG）。
// 用 SVG Icon 而非 emoji：emoji 是彩色字符，CSS color 对其无效，
// 改用 MUI Icon 后 icon 颜色可跟随状态色，与边框/徽章保持视觉统一。
const ICON: Record<ClaudeSessionStatus, SvgIconComponent> = {
  Busy: Autorenew, // 旋转刷新=工作中
  Waiting: Notifications, // 铃铛=提醒用户输入
  Idle: Schedule, // 时钟=空闲
  Dead: Bedtime, // 月亮=休眠
};

function PetSprite({ status, count }: PetSpriteProps) {
  const Icon = ICON[status];
  const color = STATUS_COLOR[status];

  return (
    <Box
      sx={{
        position: 'relative',
        width: 96,
        height: 96,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50%',
        // 半透明背景圆 + 颜色边框，让 icon 在任意桌面背景下都可见。
        bgcolor: 'rgba(255,255,255,0.85)',
        border: `3px solid ${color}`,
        boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
      }}
    >
      <Icon sx={{ color, fontSize: 56 }} />
      {count > 0 && (
        <Box
          sx={{
            position: 'absolute',
            bottom: -4,
            right: -4,
            minWidth: 22,
            height: 22,
            px: 0.5,
            borderRadius: 11,
            bgcolor: color,
            color: '#fff',
            fontSize: 12,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid #fff',
          }}
        >
          {count}
        </Box>
      )}
    </Box>
  );
}

export default PetSprite;
