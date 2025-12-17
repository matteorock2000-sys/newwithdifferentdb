const fs = require('fs');

let content = fs.readFileSync('app/components/PlayerSetupSlot.tsx', 'utf8');

// Add view mode determination logic after the props destructuring
const viewModeLogic = `
    // Determine view mode for layout variants
    const resolvedViewMode = viewMode || (
        !isLobbyView && showManagementButtons ? 'dashboard' :
        isLobbyView && !showManagementButtons ? 'rooms' :
        isLobbyView && showManagementButtons ? 'lobby' :
        'rooms' // default
    );

    // View-specific layout classes
    const getLayoutClasses = () => {
        switch (resolvedViewMode) {
            case 'dashboard':
                return {
                    container: 'flex flex-col gap-6 p-6 bg-gray-800 border-2 border-gray-700 shadow-xl',
                    cardSize: 'large',
                    portraitSize: 'lg:w-40 lg:h-40',
                    statsLayout: 'grid-cols-3',
                    attributesLayout: 'grid-cols-6',
                    equipmentCols: 'grid-cols-2',
                    buttonLayout: 'flex gap-3 mt-4'
                };
            case 'rooms':
                return {
                    container: 'flex flex-col md:flex-row md:items-center gap-4 p-4 bg-gray-700 border-2 border-gray-600 shadow-lg',
                    cardSize: 'medium',
                    portraitSize: 'md:w-32 md:h-32',
                    statsLayout: 'grid-cols-3',
                    attributesLayout: 'grid-cols-6',
                    equipmentCols: 'grid-cols-2',
                    buttonLayout: 'hidden' // No edit/delete buttons in rooms view
                };
            case 'lobby':
                return {
                    container: 'flex flex-col gap-3 p-3 bg-gray-750 border-2 border-gray-600 shadow-md',
                    cardSize: 'medium',
                    portraitSize: 'w-28 h-28 md:w-32 md:h-32',
                    statsLayout: 'grid-cols-2',
                    attributesLayout: 'grid-cols-6',
                    equipmentCols: 'grid-cols-2',
                    buttonLayout: 'hidden' // No edit/delete buttons in lobby view
                };
            default:
                return {
                    container: 'flex flex-col lg:flex-row lg:items-center gap-4 p-4',
                    cardSize: 'medium',
                    portraitSize: 'md:w-32 md:h-32',
                    statsLayout: 'grid-cols-3',
                    attributesLayout: 'grid-cols-6',
                    equipmentCols: 'grid-cols-2',
                    buttonLayout: 'flex gap-2 mt-2'
                };
        }
    };

    const layoutClasses = getLayoutClasses();
`;

// Find the line after viewMode destructuring and add the logic
content = content.replace(
    /(    viewMode, \/\/ NEW: View mode for layout variants)/,
    '$1\n' + viewModeLogic
);

// Update the main container class to use layout variant
content = content.replace(
    /return \(\s*<div className=\{`w-full min-w-0 p-4 rounded-lg shadow-lg transition duration-300 relative/,
    (match) => {
        return match.replace(
            /className=\{`w-full min-w-0 p-4 rounded-lg shadow-lg transition duration-300 relative/,
            'className={`${layoutClasses.container} w-full min-w-0 rounded-lg transition duration-300 relative'
        );
    }
);

// Update CharacterDisplayCard size to use layout variant
content = content.replace(
    /<CharacterDisplayCard character={selectedCharacter} size="medium" \/>/,
    '<CharacterDisplayCard character={selectedCharacter} size={layoutClasses.cardSize} />'
);

// Update portrait size in the inline character display (for lobby view with expand)
content = content.replace(
    /className=\{`w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 object-cover/,
    'className={`w-24 h-24 sm:w-28 sm:h-28 ${layoutClasses.portraitSize} object-cover'
);

// Update attributes grid layout
content = content.replace(
    /<div className="grid grid-cols-6 gap-4">/,
    '<div className={`grid ${layoutClasses.attributesLayout} gap-4`}>'
);

// Update stats grid layout
content = content.replace(
    /<div className="grid grid-cols-3 gap-2 text-center text-sm font-bold mt-2">/,
    '<div className={`grid ${layoutClasses.statsLayout} gap-2 text-center text-sm font-bold mt-2`}>'
);

// Update equipment grid layout
content = content.replace(
    /<div className="grid grid-cols-2 gap-3 max-h-48 overflow-y-auto">/,
    '<div className={`grid ${layoutClasses.equipmentCols} gap-3 max-h-48 overflow-y-auto`}>'
);

// Update edit/delete buttons layout
content = content.replace(
    /<div className="flex space-x-2 mt-2">/,
    '<div className={layoutClasses.buttonLayout}>'
);

fs.writeFileSync('app/components/PlayerSetupSlot.tsx', content);
console.log('Implemented layout variants for dashboard, rooms, and lobby views');
