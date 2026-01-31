export type EventCategory = 
  | 'flood'
  | 'fire'
  | 'storm'
  | 'heatwave'
  | 'air-pollution'
  | 'ocean-anomaly';

export interface EnvironmentalEvent {
  id: string;
  category: EventCategory;
  location: string;
  latitude: number;
  longitude: number;
  severity: 'low' | 'moderate' | 'high' | 'critical';
  title: string;
  description: string;
  timestamp: Date;
  temperature?: number;
  windSpeed?: number;
  humidity?: number;
  airQualityIndex?: number;
  waterLevel?: number;
  affectedArea: number; // in square kilometers
  affectedPopulation?: number;
  riskIndicators: string[];
  satelliteImageUrl?: string;
  liveFeedUrl?: string;
}

export const categoryColors: Record<EventCategory, string> = {
  'flood': '#00d4ff',
  'fire': '#ff4400',
  'storm': '#9d00ff',
  'heatwave': '#ffaa00',
  'air-pollution': '#88ff00',
  'ocean-anomaly': '#00ffaa',
};

export const categoryLabels: Record<EventCategory, string> = {
  'flood': 'Floods',
  'fire': 'Fires',
  'storm': 'Storms',
  'heatwave': 'Heatwaves',
  'air-pollution': 'Air Pollution',
  'ocean-anomaly': 'Ocean Anomalies',
};

// Mock environmental events data
export const mockEvents: EnvironmentalEvent[] = [
  {
    id: '1',
    category: 'fire',
    location: 'California, USA',
    latitude: 36.7783,
    longitude: -119.4179,
    severity: 'critical',
    title: 'Wildfire Outbreak',
    description: 'Major wildfire spreading rapidly due to high winds and dry conditions',
    timestamp: new Date('2026-01-30T14:30:00'),
    temperature: 42,
    windSpeed: 45,
    humidity: 12,
    affectedArea: 2500,
    affectedPopulation: 15000,
    riskIndicators: ['Rapid spread', 'High winds', 'Dense smoke', 'Evacuation zones'],
    satelliteImageUrl: 'https://images.unsplash.com/photo-1615092296061-e2ccfeb2f3d6?w=800',
    liveFeedUrl: 'Live camera feed available',
  },
  {
    id: '2',
    category: 'flood',
    location: 'Bangladesh',
    latitude: 23.685,
    longitude: 90.3563,
    severity: 'high',
    title: 'Monsoon Flooding',
    description: 'Severe flooding affecting multiple districts',
    timestamp: new Date('2026-01-30T08:15:00'),
    temperature: 28,
    humidity: 95,
    waterLevel: 4.5,
    affectedArea: 1800,
    affectedPopulation: 500000,
    riskIndicators: ['Rising water levels', 'Infrastructure damage', 'Disease risk'],
    satelliteImageUrl: 'https://images.unsplash.com/photo-1547683905-f686c993aae5?w=800',
  },
  {
    id: '3',
    category: 'storm',
    location: 'Atlantic Ocean',
    latitude: 25.7617,
    longitude: -80.1918,
    severity: 'critical',
    title: 'Hurricane Formation',
    description: 'Category 4 hurricane approaching coastline',
    timestamp: new Date('2026-01-30T12:00:00'),
    temperature: 29,
    windSpeed: 220,
    humidity: 88,
    affectedArea: 5000,
    affectedPopulation: 2000000,
    riskIndicators: ['Extreme winds', 'Storm surge', 'Heavy rainfall', 'Power outages'],
    satelliteImageUrl: 'https://images.unsplash.com/photo-1527482797697-8795b05a13fe?w=800',
    liveFeedUrl: 'NOAA satellite feed',
  },
  {
    id: '4',
    category: 'heatwave',
    location: 'New Delhi, India',
    latitude: 28.6139,
    longitude: 77.2090,
    severity: 'critical',
    title: 'Extreme Heatwave',
    description: 'Record-breaking temperatures causing health emergency',
    timestamp: new Date('2026-01-30T11:00:00'),
    temperature: 48,
    humidity: 35,
    affectedArea: 800,
    affectedPopulation: 20000000,
    riskIndicators: ['Heat exhaustion', 'Power grid stress', 'Water shortage'],
    satelliteImageUrl: 'https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?w=800',
  },
  {
    id: '5',
    category: 'air-pollution',
    location: 'Beijing, China',
    latitude: 39.9042,
    longitude: 116.4074,
    severity: 'high',
    title: 'Severe Air Quality Crisis',
    description: 'Hazardous smog levels affecting millions',
    timestamp: new Date('2026-01-30T09:30:00'),
    temperature: 8,
    humidity: 45,
    airQualityIndex: 387,
    affectedArea: 1200,
    affectedPopulation: 21000000,
    riskIndicators: ['Respiratory hazard', 'Visibility < 200m', 'School closures'],
    satelliteImageUrl: 'https://images.unsplash.com/photo-1611273426858-450d8e3c9fce?w=800',
  },
  {
    id: '6',
    category: 'ocean-anomaly',
    location: 'Great Barrier Reef, Australia',
    latitude: -18.2871,
    longitude: 147.6992,
    severity: 'high',
    title: 'Coral Bleaching Event',
    description: 'Mass coral bleaching due to elevated water temperatures',
    timestamp: new Date('2026-01-30T06:00:00'),
    temperature: 32,
    affectedArea: 3500,
    riskIndicators: ['Marine ecosystem collapse', 'Temperature anomaly +3°C', 'Biodiversity loss'],
    satelliteImageUrl: 'https://images.unsplash.com/photo-1583212292454-1fe6229603b7?w=800',
  },
  {
    id: '7',
    category: 'fire',
    location: 'Amazon Rainforest, Brazil',
    latitude: -3.4653,
    longitude: -62.2159,
    severity: 'critical',
    title: 'Rainforest Fire',
    description: 'Multiple fire fronts in protected areas',
    timestamp: new Date('2026-01-30T13:45:00'),
    temperature: 38,
    windSpeed: 25,
    humidity: 28,
    affectedArea: 4200,
    riskIndicators: ['Deforestation', 'Carbon emissions', 'Wildlife displacement', 'Smoke plume'],
    satelliteImageUrl: 'https://images.unsplash.com/photo-1615092296061-e2ccfeb2f3d6?w=800',
  },
  {
    id: '8',
    category: 'storm',
    location: 'Philippines',
    latitude: 12.8797,
    longitude: 121.7740,
    severity: 'high',
    title: 'Typhoon Alert',
    description: 'Tropical storm making landfall',
    timestamp: new Date('2026-01-30T10:20:00'),
    temperature: 26,
    windSpeed: 165,
    humidity: 92,
    affectedArea: 2800,
    affectedPopulation: 3000000,
    riskIndicators: ['Landslides', 'Flooding', 'Infrastructure damage'],
    satelliteImageUrl: 'https://images.unsplash.com/photo-1527482797697-8795b05a13fe?w=800',
  },
  {
    id: '9',
    category: 'flood',
    location: 'Venice, Italy',
    latitude: 45.4408,
    longitude: 12.3155,
    severity: 'moderate',
    title: 'Acqua Alta',
    description: 'High tide flooding in historic city',
    timestamp: new Date('2026-01-30T15:00:00'),
    waterLevel: 1.4,
    humidity: 78,
    affectedArea: 50,
    affectedPopulation: 50000,
    riskIndicators: ['Cultural heritage at risk', 'Economic disruption'],
    satelliteImageUrl: 'https://images.unsplash.com/photo-1547683905-f686c993aae5?w=800',
  },
  {
    id: '10',
    category: 'heatwave',
    location: 'Sahara Desert, Africa',
    latitude: 23.4162,
    longitude: 25.6628,
    severity: 'moderate',
    title: 'Desert Heat Surge',
    description: 'Extreme temperatures recorded',
    timestamp: new Date('2026-01-30T12:30:00'),
    temperature: 52,
    humidity: 8,
    affectedArea: 12000,
    riskIndicators: ['Sand storms', 'Heat records'],
    satelliteImageUrl: 'https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?w=800',
  },
  {
    id: '11',
    category: 'air-pollution',
    location: 'Los Angeles, USA',
    latitude: 34.0522,
    longitude: -118.2437,
    severity: 'moderate',
    title: 'Urban Smog',
    description: 'Poor air quality due to traffic and weather patterns',
    timestamp: new Date('2026-01-30T14:00:00'),
    temperature: 24,
    airQualityIndex: 168,
    affectedArea: 1200,
    affectedPopulation: 13000000,
    riskIndicators: ['Ozone levels', 'Respiratory advisories'],
    satelliteImageUrl: 'https://images.unsplash.com/photo-1611273426858-450d8e3c9fce?w=800',
  },
  {
    id: '12',
    category: 'ocean-anomaly',
    location: 'Pacific Ocean, Chile Coast',
    latitude: -33.4489,
    longitude: -70.6693,
    severity: 'moderate',
    title: 'Red Tide Bloom',
    description: 'Harmful algal bloom affecting marine life',
    timestamp: new Date('2026-01-30T07:45:00'),
    temperature: 19,
    affectedArea: 800,
    riskIndicators: ['Marine toxins', 'Fish kill', 'Economic impact on fisheries'],
    satelliteImageUrl: 'https://images.unsplash.com/photo-1583212292454-1fe6229603b7?w=800',
  },
];
