import type { SessionStatus } from '@src/shared/bindings';
import { Box, Typography } from '@mui/material';

interface PetSpriteProps {
  status: SessionStatus;
  count: number;
}

// 4 种 emoji 表情映射。
// Idle 用乌龟（缓慢=空闲）、Dead 用冬眠熊（无会话休眠态），两个非活跃状态都用动物保持视觉统一。
// 后续若需要动画可替换为 SVG / Lottie，props 接口不变。
const EMOJI: Record<SessionStatus, string> = {
  Busy: '🐱',
  Waiting: '😺',
  Idle: '🐢',
  Dead: '🐻',
};

const COLOR: Record<SessionStatus, string> = {
  Busy: '#ff9800', // warning 橙
  Waiting: '#03a9f4', // info 蓝
  Idle: '#9e9e9e', // 灰
  Dead: '#616161', // 深灰（无会话休眠非错误，去警示红；比 Idle 深一档区分）
};

function PetSprite({ status, count }: PetSpriteProps) {
  const emoji = EMOJI[status];
  const color = COLOR[status];

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
        // 半透明背景圆 + 颜色边框，让 emoji 在任意桌面背景下都可见。
        bgcolor: 'rgba(255,255,255,0.85)',
        border: `3px solid ${color}`,
        boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
      }}
    >
      <Typography sx={{ fontSize: 56, lineHeight: 1, userSelect: 'none' }}>
        {emoji}
      </Typography>
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
