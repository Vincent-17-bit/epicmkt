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
  "mobile-screen": faMobileScreen
};

export const categoryIcon = (name) => icons[name] ?? faStore;
