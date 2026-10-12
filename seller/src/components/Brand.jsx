import { Link } from "react-router-dom";

export default function Brand({ className }) {
  return (
    <Link to="/business/offers" className={className}>
      <svg viewBox="0 0 512 512" width="32" height="32" aria-hidden="true">
        <rect width="512" height="512" rx="112" fill="#38B6FF" />
        <path fill="#111111" d="M150 140h60v232h-60zM150 140h212v56H150zM150 226h212v60H150zM150 316h212v56H150z" />
      </svg>
      <span>EpicMKT Seller</span>
    </Link>
  );
}
