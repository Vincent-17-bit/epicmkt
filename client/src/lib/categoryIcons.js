import {
  faScissors,
  faDroplet,
  faPills,
  faSeedling,
  faDumbbell,
  faSpa,
  faWrench,
  faHammer,
  faUtensils,
  faMobileScreen,
  faCar,
  faShirt,
  faMoneyBillTransfer,
  faBasketShopping,
  faDrumstickBite,
  faCakeCandles,
  faStore
} from "@fortawesome/free-solid-svg-icons";

const icons = {
  scissors: faScissors,
  droplet: faDroplet,
  pills: faPills,
  seedling: faSeedling,
  dumbbell: faDumbbell,
  spa: faSpa,
  wrench: faWrench,
  hammer: faHammer,
  utensils: faUtensils,
  "mobile-screen": faMobileScreen,
  car: faCar,
  shirt: faShirt,
  "money-bill-transfer": faMoneyBillTransfer,
  "basket-shopping": faBasketShopping,
  "drumstick-bite": faDrumstickBite,
  "cake-candles": faCakeCandles
};

export const categoryIcon = (name) => icons[name] ?? faStore;
