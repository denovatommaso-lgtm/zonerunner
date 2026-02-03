// dev-notes/map-layout.tsx
// REFERENCE ONLY — do not import into production code


// Territory Map styling reference

export const customMapStyle = [
  {
    featureType: 'poi',
    elementType: 'all',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'transit',
    elementType: 'all',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'road',
    elementType: 'labels',
    stylers: [{ visibility: 'off' }],
  },
  {
    elementType: 'labels.text.fill',
    stylers: [{ color: '#ffffff' }],
  },
  {
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#000000' }],
  },
];

// Example layout
export const TerritoryMapReference = () => null;

// Copy/paste this MapView block wherever needed:

/*
<MapView
  provider={PROVIDER_GOOGLE}
  customMapStyle={customMapStyle}
  showsUserLocation={true}
  showsPointsOfInterest={false}
  showsBuildings={false}
  showsIndoorLevelPicker={false}
  showsIndoors={false}
  toolbarEnabled={false}
  pitchEnabled={false}
  rotateEnabled={false}
>
  <Polygon ... />
  <Polyline ... />
</MapView>
*/