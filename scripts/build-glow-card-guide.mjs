import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'public/videos/glow-card-how-it-works.mp4');
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';

if (!existsSync(dirname(output))) mkdirSync(dirname(output), { recursive: true });

const font = 'C\\:/Windows/Fonts/georgiab.ttf';
const sans = 'C\\:/Windows/Fonts/arial.ttf';
const text = (value, x, y, size, start, end, options = '') =>
  `drawtext=fontfile='${sans}':text='${value}':x=${x}:y=${y}:fontsize=${size}:fontcolor=#fefcf7:enable='between(t,${start},${end})':${options}`;
const serif = (value, x, y, size, start, end, options = '') =>
  `drawtext=fontfile='${font}':text='${value}':x=${x}:y=${y}:fontsize=${size}:fontcolor=#f7e7b0:enable='between(t,${start},${end})':${options}`;
const card = (start, end, points) => [
  `drawbox=x=760:y=150:w=370:h=390:color=#19160f:t=fill:enable='between(t,${start},${end})'`,
  `drawbox=x=760:y=150:w=370:h=390:color=#c6a23e:t=3:enable='between(t,${start},${end})'`,
  text('WINDSOR BEAUTY', 790, 184, 18, start, end, 'fontcolor=#f7e7b0'),
  text('GLOW CARD', 790, 215, 28, start, end, 'fontcolor=#ffffff'),
  serif(`${points} POINT${points === 1 ? '' : 'S'}`, 790, 285, 64, start, end),
  text('MEMBER REWARDS', 790, 370, 17, start, end, 'fontcolor=#d7c99b'),
  `drawbox=x=790:y=420:w=${Math.max(1, points) * 18}:h=14:color=#d7b65b:t=fill:enable='between(t,${start},${end})'`,
  `drawbox=x=790:y=420:w=270:h=14:color=#4b4537:t=2:enable='between(t,${start},${end})'`,
  text('£10 at 5  •  £20 at 10  •  £30 at 15', 790, 465, 15, start, end, 'fontcolor=#d7c99b'),
].join(',');

const filter = [
  'color=c=#16140f:s=1280x720:d=42:r=30',
  'drawbox=x=0:y=0:w=1280:h=720:color=#201b11:t=fill',
  'drawbox=x=0:y=0:w=1280:h=8:color=#c6a23e:t=fill',
  `drawbox=x=650:y=0:w=3:h=720:color=#403821:t=fill`,
  text('WINDSOR BEAUTY', 92, 74, 18, 0, 42, 'fontcolor=#d7b65b'),
  text('MEMBER REWARDS', 92, 103, 13, 0, 42, 'fontcolor=#bcb294'),
  serif('YOUR GLOW CARD', 92, 165, 56, 0, 5),
  text('A simple way to earn points and unlock rewards.', 92, 245, 25, 0, 5, 'fontcolor=#e9e1cf'),
  text('SIGNED IN MEMBERS', 92, 310, 17, 0, 5, 'fontcolor=#d7b65b'),
  card(0, 5, 0),

  serif('ORDER POINTS', 92, 165, 56, 6, 11),
  text('Sign in. Spend £30 or more on products. Pay for your order.', 92, 245, 25, 6, 11, 'fontcolor=#e9e1cf'),
  text('THAT PAID ORDER EARNS 1 GLOW POINT', 92, 310, 17, 6, 11, 'fontcolor=#d7b65b'),
  text('Delivery does not count towards the £30.', 92, 350, 20, 6, 11, 'fontcolor=#cfc5ad'),
  card(6, 11, 1),

  serif('REFER A FRIEND', 92, 165, 56, 12, 17),
  text('They join through your link, sign in, and make their first', 92, 245, 24, 12, 17, 'fontcolor=#e9e1cf'),
  text('paid £30 or more product order.', 92, 280, 24, 12, 17, 'fontcolor=#e9e1cf'),
  text('THEN YOU BOTH EARN A REFERRAL POINT', 92, 335, 17, 12, 17, 'fontcolor=#d7b65b'),
  card(12, 17, 1),

  serif('THEIR FIRST ORDER', 92, 165, 54, 18, 23),
  text('Your friend earns their normal order point too.', 92, 245, 25, 18, 23, 'fontcolor=#e9e1cf'),
  text('THEY RECEIVE 2 POINTS IN TOTAL', 92, 310, 17, 18, 23, 'fontcolor=#d7b65b'),
  text('1 for the order. 1 for the referral.', 92, 350, 20, 18, 23, 'fontcolor=#cfc5ad'),
  card(18, 23, 2),

  serif('REWARD STAGES', 92, 165, 56, 24, 30),
  text('5 POINTS', 92, 250, 30, 24, 30, 'fontcolor=#d7b65b'),
  serif('£10 OFF', 92, 292, 42, 24, 30),
  text('10 POINTS', 286, 250, 30, 24, 30, 'fontcolor=#d7b65b'),
  serif('£20 OFF', 286, 292, 42, 24, 30),
  text('15 POINTS', 482, 250, 30, 24, 30, 'fontcolor=#d7b65b'),
  serif('£30 OFF', 482, 292, 42, 24, 30),
  card(24, 30, 15),

  serif('KEEP MOVING FORWARD', 92, 165, 48, 31, 36),
  text('Claiming £10 or £20 does not reset your progress.', 92, 245, 25, 31, 36, 'fontcolor=#e9e1cf'),
  text('CLAIM £30 AND A NEW CARD STARTS AT ZERO', 92, 310, 17, 31, 36, 'fontcolor=#d7b65b'),
  card(31, 36, 15),

  serif('CHECK YOUR PROGRESS', 92, 165, 48, 37, 42),
  text('See your points, rewards and personal referral link', 92, 245, 25, 37, 42, 'fontcolor=#e9e1cf'),
  text('IN YOUR WINDSOR BEAUTY ACCOUNT', 92, 310, 17, 37, 42, 'fontcolor=#d7b65b'),
  card(37, 42, 5),
].join(',');

execFileSync(ffmpeg, [
  '-y', '-f', 'lavfi', '-i', filter,
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-r', '30', output,
], { stdio: 'inherit' });

console.log(`Built ${output}`);
