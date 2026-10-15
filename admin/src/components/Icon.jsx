import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBars, faBell, faChevronLeft, faCircleCheck, faClockRotateLeft, faCopy, faEllipsis, faEnvelope, faEye, faEyeSlash,
  faFileLines, faFlag, faGauge, faGear, faLock, faMagnifyingGlass, faMoneyBillWave, faPenToSquare,
  faRightFromBracket, faShieldHalved, faStore, faTriangleExclamation, faXmark,
} from "@fortawesome/free-solid-svg-icons";

const ICONS = {
  menu: faBars, bell: faBell, chevron: faChevronLeft, check: faCircleCheck, history: faClockRotateLeft, copy: faCopy,
  more: faEllipsis, mail: faEnvelope, eye: faEye, eyeOff: faEyeSlash, file: faFileLines, flag: faFlag, gauge: faGauge,
  gear: faGear, lock: faLock, search: faMagnifyingGlass, money: faMoneyBillWave, pen: faPenToSquare,
  signOut: faRightFromBracket, shield: faShieldHalved, store: faStore, warn: faTriangleExclamation, close: faXmark,
};

/** Decorative by default. Put the meaning in text or an aria-label on the button that holds it. */
export default function Icon({ name, ...rest }) {
  return <FontAwesomeIcon icon={ICONS[name]} fixedWidth aria-hidden="true" {...rest} />;
}
