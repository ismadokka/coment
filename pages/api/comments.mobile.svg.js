import commentsSvg from './comments.svg';

export default function handler(req, res) {
  req.query = { ...(req.query || {}), size: 'mobile' };
  return commentsSvg(req, res);
}
