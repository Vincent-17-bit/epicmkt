const text = (key, label, o = {}) => ({ key, label, type: 'text', ...o });
const number = (key, label, o = {}) => ({ key, label, type: 'number', ...o });
const price = (key, label, o = {}) => ({ key, label, type: 'price', ...o });
const bool = (key, label, o = {}) => ({ key, label, type: 'boolean', ...o });
const select = (key, label, options, o = {}) => ({ key, label, type: 'select', options, ...o });
const multi = (key, label, options, o = {}) => ({ key, label, type: 'multiselect', options, ...o });
const list = (key, label, o = {}) => ({ key, label, type: 'itemlist', ...o });

const delivery = () => bool('delivery', 'Delivery available', { filterable: true, showOnCard: true });
const deliveryArea = () => text('deliveryArea', 'Delivery area', { showIf: { field: 'delivery', equals: true } });
const halal = () => bool('halal', 'Halal', { filterable: true });

const INSURERS = ['SHA', 'AAR', 'Jubilee', 'Madison', 'CIC', 'Britam', 'Resolution', 'Other'];
const TURNAROUND = ['While you wait', 'Same day', '1 to 2 days', '3 to 7 days', 'More than a week'];
const WARRANTY = ['None', '7 days', '30 days', '3 months', '6 months', '1 year or more'];

const doc = (key, label, rule, why, condition) => ({ key, label, rule, ...(condition ? { condition } : {}), why });

// Document rules are drafts: an advocate must confirm them
export const categories = [
  {
    id: 'water-refill', name: 'Water refill station', group: 'Water and energy', icon: 'droplet', tier: 'A',
    keyFields: [
      price('refillPrice', 'Refill price per 20L', { required: true, showOnCard: true }),
      delivery(),
      deliveryArea(),
      bool('ownContainerRefill', 'Refill customers\' own containers', { filterable: true }),
      bool('containersForSale', 'Containers for sale'),
      multi('treatment', 'Water treatment', ['Reverse osmosis', 'UV', 'Chlorinated', 'Filtered'], { filterable: true }),
    ],
    extraDocs: [
      doc('public_health_cert', 'Public health or water quality certificate', 'required', 'Confirms the water is safe to drink.'),
      doc('kebs_mark', 'KEBS mark certificate', 'conditional', 'Confirms the standardization mark you display.', 'My water or containers carry a KEBS mark'),
    ],
  },
  {
    id: 'lpg-gas', name: 'LPG gas retailer', group: 'Water and energy', icon: 'fire-flame-curved', tier: 'A',
    keyFields: [
      multi('brands', 'Brands', ['Total', 'K-Gas', 'Afrigas', 'Hashi', 'ProGas', 'Taifa Gas', 'Lake Gas', 'Other'], { filterable: true, showOnCard: true }),
      multi('cylinderSizes', 'Cylinder sizes', ['3kg', '6kg', '13kg', '22.5kg', '50kg'], { filterable: true }),
      bool('refill', 'Refill available', { filterable: true }),
      bool('newCylinder', 'New cylinders available'),
      delivery(),
      deliveryArea(),
    ],
    extraDocs: [
      doc('epra_licence', 'EPRA LPG licence', 'required', 'LPG retail needs an EPRA licence.'),
      doc('fire_safety_cert', 'Fire safety certificate', 'required', 'Gas storage must meet fire safety rules.'),
    ],
  },
  {
    id: 'bakery', name: 'Bakery', group: 'Food and drink', icon: 'bread-slice', tier: 'B',
    keyFields: [
      multi('productTypes', 'Product types', ['Bread', 'Cakes', 'Cookies', 'Pastries', 'Buns', 'Doughnuts', 'Pies'], { required: true, filterable: true, showOnCard: true }),
      bool('customCakes', 'Custom cakes', { filterable: true }),
      select('leadTime', 'Order lead time', ['Same day', '1 day', '2 to 3 days', '1 week or more']),
      delivery(),
      halal(),
    ],
    extraDocs: [
      doc('public_health_cert', 'Public health or food hygiene certificate', 'required', 'Food businesses need a valid health certificate.'),
    ],
  },
  {
    id: 'juice-shop', name: 'Juice shop', group: 'Food and drink', icon: 'blender', tier: 'B',
    keyFields: [
      multi('menuTypes', 'Menu types', ['Fresh juice', 'Smoothies', 'Milkshakes', 'Fruit salad', 'Sugarcane', 'Coconut water'], { required: true, filterable: true, showOnCard: true }),
      multi('sizes', 'Sizes', ['250ml', '350ml', '500ml', '1L']),
      bool('noAddedSugar', 'No added sugar option', { filterable: true }),
      delivery(),
    ],
    extraDocs: [
      doc('public_health_cert', 'Public health certificate', 'required', 'Food and drink businesses need a valid health certificate.'),
    ],
  },
  {
    id: 'restaurant-cafe', name: 'Restaurant or cafe', group: 'Food and drink', icon: 'utensils', tier: 'C',
    keyFields: [
      multi('cuisine', 'Cuisine', ['Kenyan', 'Swahili', 'Indian', 'Chinese', 'Italian', 'Fast food', 'Coffee and snacks', 'Other'], { required: true, filterable: true, showOnCard: true }),
      multi('serviceModes', 'Service', ['Dine-in', 'Takeaway', 'Delivery'], { required: true, filterable: true }),
      number('seats', 'Seats'),
      halal(),
      bool('reservations', 'Takes reservations', { filterable: true }),
    ],
    extraDocs: [
      doc('public_health_food_hygiene_cert', 'Public health and food hygiene certificate', 'required', 'Restaurants need valid health and hygiene certificates.'),
    ],
  },
  {
    id: 'butchery', name: 'Butchery', group: 'Food and drink', icon: 'drumstick-bite', tier: 'A',
    keyFields: [
      multi('meatTypes', 'Meat types', ['Beef', 'Goat', 'Mutton', 'Pork', 'Chicken', 'Fish'], { required: true, filterable: true, showOnCard: true }),
      multi('cuts', 'Cuts', ['Steak', 'Ribs', 'Mince', 'Fillet', 'Offal', 'Whole carcass']),
      price('pricePerKg', 'Price per kg', { showOnCard: true }),
      delivery(),
      halal(),
    ],
    extraDocs: [
      doc('meat_inspection_cert', 'Public health or meat inspection certificate', 'required', 'Meat sellers need a valid inspection certificate.'),
    ],
  },
  {
    id: 'greengrocer', name: 'Greengrocer', group: 'Food and drink', icon: 'carrot', tier: 'A',
    keyFields: [
      multi('produceTypes', 'Produce', ['Vegetables', 'Fruit', 'Potatoes', 'Onions', 'Herbs', 'Eggs'], { required: true, filterable: true, showOnCard: true }),
      price('pricePerKg', 'Typical price per kg'),
      bool('locallySourced', 'Locally sourced', { filterable: true }),
      delivery(),
    ],
    extraDocs: [
      doc('public_health_cert', 'Public health certificate', 'optional', 'Builds customer trust.'),
    ],
  },
  {
    id: 'supermarket-minimart', name: 'Supermarket or minimart', group: 'Food and drink', icon: 'cart-shopping', tier: 'C',
    keyFields: [
      multi('departments', 'Departments', ['Groceries', 'Fresh produce', 'Butchery', 'Bakery', 'Household', 'Personal care', 'Electronics', 'Clothing'], { required: true, showOnCard: true }),
      delivery(),
      multi('paymentMethods', 'Payment methods', ['Cash', 'M-Pesa', 'Card'], { filterable: true }),
      bool('openLate', 'Open late', { filterable: true }),
    ],
    extraDocs: [],
  },
  {
    id: 'chemist', name: 'Chemist or pharmacy', group: 'Health', icon: 'pills', tier: 'D',
    keyFields: [
      bool('prescriptionRequired', 'Prescription required', { filterable: true }),
      select('dosageForm', 'Dosage form', ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Cream or ointment', 'Drops', 'Inhaler']),
      text('strength', 'Strength'),
      text('brand', 'Brand'),
      delivery(),
      bool('open24h', 'Open 24 hours', { filterable: true, showOnCard: true }),
    ],
    extraDocs: [
      doc('ppb_premises_licence', 'PPB premises licence', 'required', 'Pharmacies must hold a Pharmacy and Poisons Board licence.'),
      doc('pharmacist_registration', 'Pharmacist registration certificate', 'required', 'Confirms a registered pharmacist runs the premises.'),
    ],
  },
  {
    id: 'clinic', name: 'Clinic or health centre', group: 'Health', icon: 'stethoscope', tier: 'D',
    keyFields: [
      multi('services', 'Services', ['Outpatient', 'Maternity', 'Dental', 'Paediatrics', 'Family planning', 'Vaccination', 'Counselling'], { required: true, filterable: true, showOnCard: true }),
      multi('specialties', 'Specialties', ['General practice', 'Gynaecology', 'Paediatrics', 'Dermatology', 'ENT', 'Orthopaedics', 'Mental health']),
      multi('insuranceAccepted', 'Insurance accepted', INSURERS, { filterable: true }),
      bool('emergency', 'Emergency care', { filterable: true }),
      bool('lab', 'On-site laboratory'),
    ],
    extraDocs: [
      doc('kmpdc_facility_licence', 'KMPDC facility licence', 'required', 'Health facilities must be licensed.'),
      doc('practitioner_registration', 'Lead practitioner registration certificate', 'required', 'Confirms the lead practitioner is registered.'),
    ],
  },
  {
    id: 'optician', name: 'Optician', group: 'Health', icon: 'glasses', tier: 'C',
    keyFields: [
      bool('eyeTests', 'Eye tests offered', { filterable: true, showOnCard: true }),
      list('frameBrands', 'Frame brands'),
      multi('lensTypes', 'Lens types', ['Single vision', 'Bifocal', 'Progressive', 'Photochromic', 'Blue light']),
      multi('insuranceAccepted', 'Insurance accepted', INSURERS, { filterable: true }),
    ],
    extraDocs: [
      doc('optometry_licence', 'Optometry practice licence', 'required', 'Optical practice must be licensed.'),
    ],
  },
  {
    id: 'barbershop', name: 'Barbershop', group: 'Beauty and fitness', icon: 'scissors', tier: 'B',
    keyFields: [
      multi('services', 'Services', ['Haircut', 'Shave', 'Beard trim', 'Dyeing', 'Hair treatment', 'Dreadlocks'], { required: true, filterable: true, showOnCard: true }),
      bool('walkIns', 'Walk-ins welcome', { filterable: true }),
      bool('appointments', 'Appointments'),
      bool('kidsCuts', 'Kids cuts', { filterable: true }),
    ],
    extraDocs: [
      doc('public_health_cert', 'Public health certificate', 'optional', 'Builds customer trust.'),
    ],
  },
  {
    id: 'salon-beauty', name: 'Salon and beauty', group: 'Beauty and fitness', icon: 'wand-magic-sparkles', tier: 'C',
    keyFields: [
      multi('services', 'Services', ['Hair styling', 'Braiding', 'Weaves', 'Manicure', 'Pedicure', 'Makeup', 'Facials', 'Waxing'], { required: true, filterable: true, showOnCard: true }),
      bool('appointmentNeeded', 'Appointment needed', { filterable: true }),
      bool('homeService', 'Home service', { filterable: true }),
      number('staff', 'Number of staff'),
    ],
    extraDocs: [
      doc('public_health_cert', 'Public health certificate', 'optional', 'Builds customer trust.'),
    ],
  },
  {
    id: 'spa-massage', name: 'Spa and massage', group: 'Beauty and fitness', icon: 'spa', tier: 'C',
    keyFields: [
      multi('treatments', 'Treatments', ['Swedish massage', 'Deep tissue', 'Hot stone', 'Aromatherapy', 'Body scrub', 'Facial', 'Sauna or steam'], { required: true, filterable: true, showOnCard: true }),
      multi('durations', 'Session durations', ['30 min', '60 min', '90 min', '120 min']),
      bool('womenOnly', 'Women only', { filterable: true }),
      bool('couples', 'Couples sessions'),
    ],
    extraDocs: [
      doc('public_health_cert', 'Public health certificate', 'required', 'Spas need a valid health certificate.'),
      doc('therapist_cert', 'Therapist certificate', 'optional', 'Shows your therapists are trained.'),
    ],
  },
  {
    id: 'gym-fitness', name: 'Gym and fitness', group: 'Beauty and fitness', icon: 'dumbbell', tier: 'D',
    keyFields: [
      multi('membershipTerms', 'Membership terms', ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Annual'], { required: true, showOnCard: true }),
      multi('classes', 'Classes', ['Aerobics', 'Zumba', 'Yoga', 'Spinning', 'Boxing', 'CrossFit']),
      multi('equipment', 'Equipment', ['Free weights', 'Cardio machines', 'Resistance machines', 'Punching bags']),
      bool('showers', 'Showers'),
      bool('lockers', 'Lockers'),
      bool('trainer', 'Personal trainer available', { filterable: true }),
    ],
    extraDocs: [
      doc('fire_clearance', 'Fire clearance certificate', 'optional', 'Shows the premises meet fire safety rules.'),
      doc('instructor_cert', 'Instructor certificate', 'optional', 'Shows your trainers are qualified.'),
    ],
  },
  {
    id: 'agrovet', name: 'Agrovet', group: 'Agriculture', icon: 'seedling', tier: 'C',
    keyFields: [
      bool('seeds', 'Seeds', { filterable: true }),
      bool('fertiliser', 'Fertiliser', { filterable: true }),
      bool('agrochemicals', 'Agrochemicals', { filterable: true }),
      bool('vetDrugs', 'Veterinary drugs', { filterable: true }),
      list('brand', 'Brands stocked'),
      text('packSize', 'Common pack sizes'),
      bool('adviceOffered', 'Farming advice offered', { filterable: true }),
    ],
    extraDocs: [
      doc('pcpb_licence', 'PCPB licence', 'conditional', 'Agrochemical sellers must be licensed by the Pest Control Products Board.', 'I sell agrochemicals'),
      doc('kvb_registration', 'Kenya Veterinary Board registration', 'conditional', 'Veterinary drug sellers must be registered.', 'I sell veterinary drugs'),
    ],
  },
  {
    id: 'cyber-cafe', name: 'Cyber cafe', group: 'Tech and office', icon: 'computer', tier: 'A',
    keyFields: [
      multi('services', 'Services', ['Internet browsing', 'Online applications', 'Typing', 'Printing', 'Scanning', 'Photocopying', 'Lamination'], { required: true, filterable: true, showOnCard: true }),
      price('ratePerHour', 'Rate per hour', { showOnCard: true }),
      bool('printing', 'Printing', { filterable: true }),
      bool('scanning', 'Scanning'),
      number('computers', 'Number of computers'),
      bool('wifi', 'Wi-Fi', { filterable: true }),
    ],
    extraDocs: [],
  },
  {
    id: 'phone-repair', name: 'Phone repair', group: 'Tech and office', icon: 'mobile-screen-button', tier: 'B',
    keyFields: [
      multi('repairs', 'Repairs', ['Screen', 'Battery', 'Charging port', 'Water damage', 'Software', 'Speaker or microphone', 'Camera'], { required: true, filterable: true, showOnCard: true }),
      multi('brands', 'Brands', ['Apple', 'Samsung', 'Tecno', 'Infinix', 'Xiaomi', 'Oppo', 'Huawei', 'Nokia', 'Other'], { filterable: true }),
      select('warranty', 'Repair warranty', WARRANTY),
      bool('accessories', 'Accessories sold'),
      select('turnaround', 'Turnaround', TURNAROUND),
    ],
    extraDocs: [],
  },
  {
    id: 'electronics-appliances', name: 'Electronics and appliances', group: 'Tech and office', icon: 'plug', tier: 'C',
    keyFields: [
      list('brands', 'Brands', { showOnCard: true }),
      select('warranty', 'Warranty', WARRANTY),
      bool('installation', 'Installation offered'),
      delivery(),
      multi('condition', 'Condition', ['New', 'Refurbished'], { filterable: true }),
    ],
    extraDocs: [],
  },
  {
    id: 'printing-stationery', name: 'Printing and stationery', group: 'Tech and office', icon: 'print', tier: 'B',
    keyFields: [
      multi('services', 'Services', ['Printing', 'Photocopying', 'Binding', 'Lamination', 'Banners', 'Business cards', 'T-shirt printing', 'Stationery'], { required: true, filterable: true, showOnCard: true }),
      bool('bulkOrders', 'Bulk orders', { filterable: true }),
      bool('sameDay', 'Same-day service', { filterable: true }),
      bool('designHelp', 'Design help'),
    ],
    extraDocs: [],
  },
  {
    id: 'mpesa-airtime-agent', name: 'M-Pesa and airtime agent', group: 'Tech and office', icon: 'money-bill-transfer', tier: 'A',
    keyFields: [
      multi('services', 'Services', ['M-Pesa deposit and withdrawal', 'Airtime', 'Bill payments', 'Pesalink', 'Lipa na M-Pesa till'], { required: true, filterable: true, showOnCard: true }),
      bool('openLate', 'Open late', { filterable: true }),
      bool('bankingAgent', 'Banking agent', { filterable: true }),
    ],
    extraDocs: [
      doc('agent_authorisation', 'Proof of agent or till authorisation', 'required', 'Confirms you are an authorised agent.'),
    ],
  },
  {
    id: 'hardware-building', name: 'Hardware and building supplies', group: 'Home and construction', icon: 'hammer', tier: 'C',
    keyFields: [
      multi('categories', 'Product categories', ['Cement', 'Iron sheets', 'Timber', 'Paint', 'Plumbing', 'Electrical', 'Tools', 'Tiles'], { required: true, filterable: true, showOnCard: true }),
      delivery(),
      bool('bulk', 'Bulk orders', { filterable: true }),
      bool('cuttingService', 'Cutting service'),
    ],
    extraDocs: [],
  },
  {
    id: 'plumbing-electrical', name: 'Plumbing and electrical', group: 'Home and construction', icon: 'wrench', tier: 'B',
    keyFields: [
      multi('services', 'Services', ['Plumbing', 'Electrical wiring', 'Solar installation', 'Water tanks', 'Repairs', 'New installations'], { required: true, filterable: true, showOnCard: true }),
      price('callOutFee', 'Call-out fee'),
      bool('emergency24h', 'Emergency 24 hours', { filterable: true }),
      text('serviceArea', 'Service area'),
    ],
    extraDocs: [
      doc('contractor_licence', 'Electrical or contractor licence', 'optional', 'Shows you are a licensed contractor.'),
    ],
  },
  {
    id: 'furniture-carpentry', name: 'Furniture and carpentry', group: 'Home and construction', icon: 'couch', tier: 'C',
    keyFields: [
      multi('types', 'Furniture types', ['Beds', 'Sofas', 'Tables', 'Wardrobes', 'Kitchen cabinets', 'Doors and windows', 'Office furniture'], { required: true, filterable: true, showOnCard: true }),
      bool('customMade', 'Custom made', { filterable: true }),
      multi('materials', 'Materials', ['Hardwood', 'Softwood', 'MDF', 'Metal', 'Upholstery']),
      delivery(),
    ],
    extraDocs: [],
  },
  {
    id: 'cleaning-laundry', name: 'Cleaning and laundry', group: 'Home and construction', icon: 'soap', tier: 'B',
    keyFields: [
      multi('services', 'Services', ['Laundry', 'Dry cleaning', 'Ironing', 'Carpet cleaning', 'House cleaning', 'Office cleaning'], { required: true, filterable: true, showOnCard: true }),
      bool('pickupDelivery', 'Pickup and delivery', { filterable: true }),
      price('pricePerKg', 'Price per kg'),
      select('turnaround', 'Turnaround', TURNAROUND),
    ],
    extraDocs: [],
  },
  {
    id: 'tailor-boutique', name: 'Tailor and boutique', group: 'Fashion', icon: 'shirt', tier: 'B',
    keyFields: [
      bool('tailoring', 'Tailoring', { filterable: true, showOnCard: true }),
      bool('alterations', 'Alterations', { filterable: true }),
      bool('readyMade', 'Ready-made clothes', { filterable: true }),
      select('turnaround', 'Turnaround', TURNAROUND),
    ],
    extraDocs: [],
  },
  {
    id: 'shoes-cobbler', name: 'Shoes and cobbler', group: 'Fashion', icon: 'shoe-prints', tier: 'A',
    keyFields: [
      multi('repairs', 'Repairs', ['Soles', 'Stitching', 'Polishing', 'Zips', 'Heels', 'Stretching'], { filterable: true, showOnCard: true }),
      bool('newShoes', 'New shoes sold', { filterable: true }),
      list('brands', 'Brands'),
    ],
    extraDocs: [],
  },
  {
    id: 'garage-mechanic', name: 'Garage and mechanic', group: 'Auto', icon: 'screwdriver-wrench', tier: 'B',
    keyFields: [
      multi('services', 'Services', ['General repair', 'Servicing', 'Brakes', 'Suspension', 'Electrical', 'Body work', 'Tyres', 'Engine overhaul'], { required: true, filterable: true, showOnCard: true }),
      multi('vehicleTypes', 'Vehicle types', ['Cars', 'Motorbikes', 'Trucks', 'Matatus', 'Tuk-tuks'], { filterable: true }),
      bool('towing', 'Towing', { filterable: true }),
      bool('diagnostics', 'Computer diagnostics'),
    ],
    extraDocs: [],
  },
  {
    id: 'car-wash', name: 'Car wash', group: 'Auto', icon: 'car', tier: 'A',
    keyFields: [
      multi('washTypes', 'Wash types', ['Exterior', 'Interior', 'Full wash', 'Engine wash', 'Polishing', 'Waxing'], { required: true, filterable: true, showOnCard: true }),
      multi('vehicleSizes', 'Vehicle sizes', ['Saloon', 'SUV', 'Van', 'Truck', 'Motorbike']),
      bool('mobileService', 'Mobile service', { filterable: true }),
    ],
    extraDocs: [
      doc('county_permit', 'County environment or water permit', 'optional', 'Shows you follow local water rules.'),
    ],
  },
  {
    id: 'auto-spare-parts', name: 'Auto spare parts', group: 'Auto', icon: 'gears', tier: 'C',
    keyFields: [
      list('brands', 'Brands', { showOnCard: true }),
      multi('vehicleMakes', 'Vehicle makes', ['Toyota', 'Nissan', 'Mazda', 'Subaru', 'Honda', 'Isuzu', 'Mitsubishi', 'Mercedes', 'Other'], { required: true, filterable: true }),
      select('partType', 'Part type', ['Genuine', 'Aftermarket', 'Both'], { filterable: true }),
      delivery(),
    ],
    extraDocs: [],
  },
  {
    id: 'photography-events', name: 'Photography and events', group: 'Services and education', icon: 'camera', tier: 'B',
    keyFields: [
      multi('services', 'Services', ['Weddings', 'Portraits', 'Events', 'Video', 'Drone', 'Product photos', 'Passport photos'], { required: true, filterable: true, showOnCard: true }),
      list('packages', 'Packages'),
      text('coverageArea', 'Coverage area'),
      select('deliveryTime', 'Photo delivery time', ['Same day', '1 to 3 days', '1 week', '2 weeks or more']),
    ],
    extraDocs: [],
  },
  {
    id: 'tuition-daycare', name: 'Tuition and daycare', group: 'Services and education', icon: 'graduation-cap', tier: 'C',
    keyFields: [
      multi('levels', 'Levels', ['Daycare', 'Nursery', 'Primary', 'Secondary', 'Adult classes', 'Tuition'], { required: true, filterable: true, showOnCard: true }),
      text('ages', 'Ages accepted'),
      price('feesPerTerm', 'Fees per term', { showOnCard: true }),
      bool('transport', 'Transport', { filterable: true }),
      bool('meals', 'Meals provided', { filterable: true }),
    ],
    extraDocs: [
      doc('childcare_registration', 'Childcare or education registration certificate', 'required', 'Schools and daycares must be registered.'),
      doc('good_conduct_cert', 'Staff certificate of good conduct', 'optional', 'Reassures parents about staff vetting.'),
    ],
  },
  {
    id: 'phones-accessories', name: 'Phones and Accessories', group: 'Tech and office', icon: 'mobile-screen-button', tier: 'C',
    keyFields: [
      multi('sells', 'Products', ['New phones', 'Used and refurbished phones', 'Feature phones', 'Phone cases and covers', 'Screen protectors', 'Chargers and cables', 'Power banks', 'Earphones and headphones', 'Memory cards', 'SIM cards and airtime'], { required: true, filterable: true, showOnCard: true }),
      multi('brands', 'Phone brands', ['Apple', 'Samsung', 'Tecno', 'Infinix', 'Xiaomi', 'Oppo', 'Huawei', 'Nokia', 'itel', 'Other'], { filterable: true }),
      multi('condition', 'Condition', ['New', 'Refurbished', 'Used'], { filterable: true, showOnCard: true }),
      select('warranty', 'Warranty on phones', WARRANTY),
      bool('genuineAccessories', 'Original accessories sold', { filterable: true }),
      bool('installments', 'Pay in instalments', { filterable: true }),
      bool('tradeIn', 'Trade-in or swap accepted'),
      bool('repairs', 'Repairs and screen fitting'),
      delivery(),
      deliveryArea(),
    ],
    extraDocs: [
      doc('dealer_authorisation', 'Authorised dealer or distributor letter', 'optional', 'Shows customers you sell genuine stock.'),
    ],
  },
  {
    id: 'electronics-computers', name: 'Electronics and Computers', group: 'Tech and office', icon: 'laptop', tier: 'C',
    keyFields: [
      multi('sells', 'Products', ['Laptops', 'Desktop computers', 'Monitors', 'Printers and scanners', 'Keyboards and mice', 'Flash disks and hard drives', 'Routers and networking', 'TVs and decoders', 'Speakers and audio', 'Cameras and CCTV', 'Gaming consoles', 'Solar and power backup'], { required: true, filterable: true, showOnCard: true }),
      list('brands', 'Brands', { showOnCard: true }),
      multi('condition', 'Condition', ['New', 'Refurbished', 'Used'], { filterable: true, showOnCard: true }),
      select('warranty', 'Warranty', WARRANTY),
      bool('installation', 'Installation and setup'),
      bool('repairs', 'Repairs and servicing', { filterable: true }),
      bool('installments', 'Pay in instalments', { filterable: true }),
      bool('bulkOrders', 'Bulk and office orders'),
      delivery(),
      deliveryArea(),
    ],
    extraDocs: [
      doc('dealer_authorisation', 'Authorised dealer or distributor letter', 'optional', 'Shows customers you sell genuine stock.'),
    ],
  },
  {
    id: 'fashion-boutiques', name: 'Fashion and Boutiques', group: 'Fashion', icon: 'bag-shopping', tier: 'C',
    keyFields: [
      multi('sells', 'Sells', ['Dresses and tops', 'Trousers and jeans', 'Suits and formal wear', 'Kitenge and African print', 'Shoes and sandals', 'Sneakers', 'Bags and accessories', 'Underwear and socks', 'Kids wear', 'Sportswear', 'Uniforms'], { required: true, filterable: true, showOnCard: true }),
      multi('for', 'Clothing for', ['Women', 'Men', 'Kids'], { filterable: true, showOnCard: true }),
      multi('condition', 'Condition', ['New', 'Mitumba (second-hand)'], { filterable: true, showOnCard: true }),
      bool('footwear', 'Footwear sold', { filterable: true }),
      multi('footwearTypes', 'Footwear', ['Sneakers', 'Sandals', 'Formal shoes', 'Boots', 'Heels', 'School shoes'], { filterable: true, showIf: { field: 'footwear', equals: true } }),
      text('sizes', 'Sizes stocked'),
      bool('fittingRoom', 'Fitting room'),
      bool('exchanges', 'Exchanges allowed'),
      delivery(),
      deliveryArea(),
    ],
    extraDocs: [],
  },
  {
    id: 'home-kitchen', name: 'Home and Kitchen', group: 'Home and construction', icon: 'kitchen-set', tier: 'C',
    keyFields: [
      multi('sells', 'Products', ['Cookware and sufurias', 'Dinnerware and cutlery', 'Kitchen appliances', 'Storage and containers', 'Bedding and linen', 'Curtains and rugs', 'Cleaning supplies', 'Home decor', 'Bathroom items', 'Lighting', 'Gas cookers and jikos'], { required: true, filterable: true, showOnCard: true }),
      list('brands', 'Brands', { showOnCard: true }),
      multi('condition', 'Condition', ['New', 'Refurbished'], { filterable: true }),
      select('warranty', 'Warranty on appliances', WARRANTY),
      bool('giftSets', 'Gift and wedding sets', { filterable: true }),
      bool('wholesale', 'Wholesale prices', { filterable: true }),
      delivery(),
      deliveryArea(),
    ],
    extraDocs: [],
  },
  // ---- Added with the catalogue coverage work. The tier sets the plan prices (TIER_PLANS in config/plans.seed.js): A for small stalls and
  // mills, B for trades and small shops, C for established shops and agencies, D for licensed or high-value businesses.
  {
    id: 'poultry-shop', name: 'Poultry and eggs', group: 'Agriculture', icon: 'egg', tier: 'B',
    keyFields: [
      multi('sells', 'Sells', ['Day-old chicks', 'Growers and layers', 'Broilers (live)', 'Dressed chicken', 'Eggs', 'Turkeys and ducks', 'Poultry feed', 'Drinkers and feeders', 'Incubators and brooders'], { required: true, filterable: true, showOnCard: true }),
      multi('breeds', 'Breeds', ['Kienyeji', 'Improved kienyeji', 'Kenbro', 'Broiler', 'Layer', 'Sasso', 'Other'], { filterable: true }),
      bool('vaccinated', 'Chicks come vaccinated', { filterable: true }),
      bool('wholesale', 'Wholesale prices', { filterable: true }),
      delivery(),
      deliveryArea(),
    ],
    extraDocs: [],
  },
  {
    id: 'fish-mama-mboga', name: 'Fish and mama mboga', group: 'Food and drink', icon: 'fish', tier: 'A',
    keyFields: [
      multi('sells', 'Sells', ['Tilapia', 'Nile perch', 'Omena', 'Fresh fish', 'Smoked and dried fish', 'Vegetables', 'Fruit', 'Tomatoes and onions', 'Potatoes and cereals', 'Eggs'], { required: true, filterable: true, showOnCard: true }),
      multi('sold', 'Sold by', ['Per kg', 'Per piece', 'Per heap', 'Per bunch'], { filterable: true }),
      bool('cleaning', 'Fish cleaned and gutted', { filterable: true }),
      bool('fresh', 'Fresh stock daily', { filterable: true, showOnCard: true }),
      delivery(),
      deliveryArea(),
    ],
    extraDocs: [
      doc('public_health_cert', 'County public health certificate', 'conditional', 'Fish handling needs a public health check.', 'I sell fresh or smoked fish'),
    ],
  },
  {
    id: 'wines-spirits-bar', name: 'Wines, spirits and bar', group: 'Food and drink', icon: 'wine-glass', tier: 'C',
    keyFields: [
      multi('sells', 'Sells', ['Beer and cider', 'Wine', 'Whisky', 'Vodka and gin', 'Brandy and cognac', 'Rum and tequila', 'Liqueurs', 'Soft drinks and mixers', 'Snacks'], { required: true, filterable: true, showOnCard: true }),
      multi('service', 'Service', ['Bottle shop', 'Bar and drinks', 'Nyama choma', 'Events and bulk orders'], { filterable: true }),
      bool('delivery', 'Delivery available (18 and over only)', { filterable: true, showOnCard: true }),
      deliveryArea(),
      bool('wholesale', 'Wholesale prices', { filterable: true }),
      text('hours', 'Last orders'),
    ],
    extraDocs: [
      doc('liquor_licence', 'County liquor licence', 'required', 'Selling alcohol needs a county liquor licence.'),
    ],
  },
  {
    id: 'posho-mill-cereals', name: 'Posho mill and cereals', group: 'Food and drink', icon: 'wheat-awn', tier: 'A',
    keyFields: [
      multi('sells', 'Sells', ['Maize flour', 'Wheat flour', 'Millet and sorghum flour', 'Whole maize', 'Beans and legumes', 'Rice', 'Cooking oil', 'Animal feed'], { required: true, filterable: true, showOnCard: true }),
      bool('milling', 'Milling service (bring your grain)', { filterable: true, showOnCard: true }),
      price('millingPrice', 'Milling price per kg', { showIf: { field: 'milling', equals: true } }),
      bool('wholesale', 'Wholesale (90 kg bags)', { filterable: true }),
      delivery(),
      deliveryArea(),
    ],
    extraDocs: [
      doc('public_health_cert', 'Public health certificate', 'required', 'Milling and food handling need a public health certificate.'),
    ],
  },
  {
    id: 'baby-shop', name: 'Baby shop', group: 'Fashion', icon: 'baby', tier: 'B',
    keyFields: [
      multi('sells', 'Sells', ['Baby clothes', 'Diapers and wipes', 'Feeding bottles and sterilisers', 'Baby food and formula', 'Strollers and car seats', 'Cots and bedding', 'Toys', 'Bath and skincare', 'Maternity items'], { required: true, filterable: true, showOnCard: true }),
      multi('ages', 'Ages', ['Newborn', '0 to 12 months', '1 to 3 years', '3 to 6 years'], { filterable: true }),
      multi('condition', 'Condition', ['New', 'Mitumba (second-hand)'], { filterable: true }),
      list('brands', 'Brands', { showOnCard: true }),
      delivery(),
      deliveryArea(),
    ],
    extraDocs: [],
  },
  {
    id: 'cosmetics-beauty-products', name: 'Cosmetics and beauty supplies', group: 'Beauty and fitness', icon: 'spray-can-sparkles', tier: 'B',
    keyFields: [
      multi('sells', 'Sells', ['Makeup', 'Skincare', 'Hair products', 'Wigs and weaves', 'Nail products', 'Perfume', 'Body lotions and oils', 'Barber and salon supplies', 'Beauty tools'], { required: true, filterable: true, showOnCard: true }),
      list('brands', 'Brands', { showOnCard: true }),
      bool('authentic', 'Genuine products only', { filterable: true, showOnCard: true }),
      bool('wholesale', 'Wholesale for salons', { filterable: true }),
      delivery(),
      deliveryArea(),
    ],
    extraDocs: [],
  },
  {
    id: 'hotels-lodging', name: 'Hotels and lodging', group: 'Services and education', icon: 'hotel', tier: 'D',
    keyFields: [
      select('stay', 'Type of stay', ['Hotel', 'Lodge', 'Guest house', 'Airbnb or short stay', 'Serviced apartment', 'Resort', 'Hostel'], { required: true, filterable: true, showOnCard: true }),
      number('rooms', 'Number of rooms', { filterable: true }),
      price('fromPrice', 'Rooms from (per night)', { required: true, showOnCard: true }),
      multi('amenities', 'Amenities', ['Wi-Fi', 'Parking', 'Restaurant', 'Breakfast included', 'Hot shower', 'Air conditioning', 'Swimming pool', 'Conference hall', 'Gym', 'Airport pickup'], { filterable: true }),
      bool('conference', 'Conference and event space', { filterable: true }),
      text('checkIn', 'Check-in and check-out times'),
    ],
    extraDocs: [
      doc('tourism_licence', 'Tourism Regulatory Authority licence', 'required', 'Hotels and lodges need a TRA licence.'),
      doc('public_health_cert', 'Public health certificate', 'required', 'Accommodation with food service needs a public health certificate.'),
    ],
  },
  {
    id: 'rentals-real-estate', name: 'Rentals and real estate', group: 'Services and education', icon: 'house-chimney', tier: 'D',
    keyFields: [
      multi('offers', 'Offers', ['Houses and apartments to rent', 'Bedsitters and single rooms', 'Commercial space and shops', 'Land for sale', 'Houses for sale', 'Property management', 'Agent services'], { required: true, filterable: true, showOnCard: true }),
      text('areas', 'Areas covered', { showOnCard: true }),
      price('fromRent', 'Rents from (per month)', { showOnCard: true }),
      bool('viewing', 'Free viewing', { filterable: true }),
      bool('agentFee', 'Agent fee charged', { filterable: true }),
    ],
    extraDocs: [
      doc('estate_agent_registration', 'Estate Agents Registration Board certificate', 'conditional', 'Agents need to be registered with the board.', 'I act as an agent for other owners'),
    ],
  },
  {
    id: 'event-hire', name: 'Event hire and decor', group: 'Services and education', icon: 'tents', tier: 'B',
    keyFields: [
      multi('hires', 'Hire items', ['Tents', 'Chairs and tables', 'Sound system and DJ', 'Lighting', 'Decor and flowers', 'Cutlery and crockery', 'Stage and dance floor', 'Bouncing castles', 'Generators'], { required: true, filterable: true, showOnCard: true }),
      bool('setup', 'Delivery and setup included', { filterable: true }),
      bool('planning', 'Event planning offered', { filterable: true }),
      text('area', 'Area covered', { showOnCard: true }),
      text('leadTime', 'Book at least this long before'),
    ],
    extraDocs: [],
  },
  {
    id: 'transport-logistics', name: 'Transport and logistics', group: 'Auto', icon: 'truck', tier: 'B',
    keyFields: [
      multi('services', 'Services', ['Boda boda and tuk tuk', 'Taxi', 'Airport shuttle', 'Bus and matatu hire', 'Parcel delivery', 'Goods haulage', 'House and office moving', 'Vehicle hire', 'Towing'], { required: true, filterable: true, showOnCard: true }),
      multi('vehicles', 'Vehicles', ['Motorbike', 'Car', 'Van', 'Pickup', 'Lorry', 'Minibus', 'Bus'], { filterable: true }),
      text('area', 'Area covered', { showOnCard: true }),
      bool('open24', 'Available 24 hours', { filterable: true }),
      bool('insured', 'Goods and passengers insured', { filterable: true }),
    ],
    extraDocs: [
      doc('ntsa_licence', 'NTSA licence for the service', 'conditional', 'Public service and goods vehicles need an NTSA licence.', 'I carry passengers or goods for hire'),
      doc('insurance_cover', 'Insurance certificate', 'conditional', 'Insurance covers passengers and goods in transit.', 'I carry passengers or goods for hire'),
    ],
  },
  {
    id: 'motorbike-sales-parts', name: 'Motorbike sales and parts', group: 'Auto', icon: 'motorcycle', tier: 'C',
    keyFields: [
      multi('sells', 'Sells', ['New motorbikes', 'Used motorbikes', 'Spare parts', 'Tyres and batteries', 'Helmets and riding gear', 'Engine oil', 'Accessories'], { required: true, filterable: true, showOnCard: true }),
      list('brands', 'Brands', { showOnCard: true }),
      bool('repairs', 'Repairs and servicing', { filterable: true }),
      bool('financing', 'Financing or lipa mdogo mdogo', { filterable: true }),
      bool('logbook', 'Logbook transfer help', { filterable: true }),
      select('warranty', 'Warranty on new bikes', WARRANTY),
    ],
    extraDocs: [],
  },
  {
    id: 'solar-energy', name: 'Solar and energy', group: 'Water and energy', icon: 'solar-panel', tier: 'C',
    keyFields: [
      multi('sells', 'Sells', ['Solar panels', 'Batteries', 'Inverters', 'Charge controllers', 'Solar water heaters', 'Solar lights', 'Complete home kits', 'Generators', 'Solar pumps'], { required: true, filterable: true, showOnCard: true }),
      bool('installation', 'Installation offered', { filterable: true, showOnCard: true }),
      bool('payAsYouGo', 'Pay as you go or instalments', { filterable: true }),
      list('brands', 'Brands', { showOnCard: true }),
      select('warranty', 'Warranty on equipment', WARRANTY),
      bool('siteVisit', 'Free site visit', { filterable: true }),
    ],
    extraDocs: [
      doc('epra_solar_licence', 'EPRA solar licence', 'required', 'Solar installation needs an EPRA licence.'),
    ],
  },
  {
    id: 'welding-fabrication', name: 'Welding and fabrication', group: 'Home and construction', icon: 'helmet-safety', tier: 'B',
    keyFields: [
      multi('makes', 'We make', ['Gates', 'Grills and burglar bars', 'Doors and windows', 'Stair and balcony railings', 'Roof trusses', 'Tanks and stands', 'Shop shutters', 'Furniture frames', 'Custom work'], { required: true, filterable: true, showOnCard: true }),
      multi('materials', 'Materials', ['Mild steel', 'Stainless steel', 'Aluminium', 'Galvanised'], { filterable: true }),
      bool('measuring', 'Free measuring visit', { filterable: true }),
      bool('installation', 'Installation included', { filterable: true }),
      text('leadTime', 'Typical days to make'),
    ],
    extraDocs: [],
  },
  {
    id: 'security-cctv', name: 'Security and CCTV', group: 'Tech and office', icon: 'video', tier: 'C',
    keyFields: [
      multi('sells', 'Sells and installs', ['CCTV cameras', 'Alarms', 'Electric fence', 'Gate automation', 'Access control', 'Intercoms', 'Smoke detectors', 'Dash cams'], { required: true, filterable: true, showOnCard: true }),
      bool('installation', 'Installation offered', { filterable: true, showOnCard: true }),
      bool('maintenance', 'Maintenance plans', { filterable: true }),
      bool('remoteView', 'Phone viewing set up', { filterable: true }),
      list('brands', 'Brands', { showOnCard: true }),
      select('warranty', 'Warranty', WARRANTY),
    ],
    extraDocs: [
      doc('psra_licence', 'Private Security Regulatory Authority licence', 'conditional', 'Monitoring and guard services need a PSRA licence.', 'I offer guarding or alarm monitoring'),
    ],
  },
  {
    id: 'pet-shop-vet', name: 'Pet shop and vet', group: 'Agriculture', icon: 'paw', tier: 'B',
    keyFields: [
      multi('sells', 'Sells', ['Dog food', 'Cat food', 'Bird and fish supplies', 'Pet accessories', 'Pet medicine', 'Puppies and kittens', 'Aquariums', 'Grooming products'], { required: true, filterable: true, showOnCard: true }),
      multi('services', 'Services', ['Vet consultation', 'Vaccination', 'Grooming', 'Boarding', 'Training'], { filterable: true }),
      bool('homeVisits', 'Home visits', { filterable: true }),
      bool('emergency', 'Emergency callout', { filterable: true }),
      delivery(),
      deliveryArea(),
    ],
    extraDocs: [
      doc('kvb_registration', 'Kenya Veterinary Board registration', 'conditional', 'Veterinary services need KVB registration.', 'I offer veterinary services or sell vet drugs'),
    ],
  },
  {
    id: 'bookshop', name: 'Bookshop', group: 'Services and education', icon: 'book', tier: 'B',
    keyFields: [
      multi('sells', 'Sells', ['School textbooks', 'Revision books and past papers', 'Storybooks', 'Novels', 'Religious books', 'Reference books', 'Exercise books and stationery', 'Used books'], { required: true, filterable: true, showOnCard: true }),
      multi('levels', 'Levels', ['Pre-primary', 'Primary', 'Junior school', 'Senior school', 'College and university', 'Adult'], { filterable: true }),
      bool('orders', 'Special orders taken', { filterable: true }),
      bool('schoolSupply', 'Supplies schools in bulk', { filterable: true }),
      delivery(),
      deliveryArea(),
    ],
    extraDocs: [],
  },
  {
    id: 'professional-services', name: 'Professional services', group: 'Services and education', icon: 'briefcase', tier: 'D',
    keyFields: [
      multi('field', 'Field', ['Legal', 'Accounting and tax', 'Architecture and surveying', 'Engineering', 'Consulting', 'Insurance', 'Real estate valuation', 'Marketing and design', 'Software and web', 'Translation'], { required: true, filterable: true, showOnCard: true }),
      select('consultation', 'First consultation', ['Free', 'Paid', 'Depends on case'], { filterable: true, showOnCard: true }),
      bool('remote', 'Online consultations', { filterable: true }),
      bool('fixedFees', 'Fixed fee packages', { filterable: true }),
      text('registration', 'Professional body and number'),
    ],
    extraDocs: [
      doc('professional_registration', 'Professional registration certificate', 'conditional', 'Regulated professions need current registration.', 'My profession is regulated (law, accounting, architecture, engineering)'),
    ],
  },
];

export const categoryById = Object.fromEntries(categories.map((c) => [c.id, c]));
export const FIELD_TYPES = ['text', 'longtext', 'number', 'price', 'boolean', 'select', 'multiselect', 'timerange', 'url', 'image', 'itemlist'];
