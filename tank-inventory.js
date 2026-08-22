/**
 * @file tank-inventory.js
 * @description Mangamar Dive Center - Tank & Cylinder Inventory Management Engine
 */

window.tankInventoryList = [];
window.activeTankEditId = null;
window.tankSortState = { key: null, asc: true }; // null preserves original sheet order

// Complete dataset extracted directly from the official Mangamar Google Sheet / PDF
window.INITIAL_TANK_DATA = [
    // Page 1 - 12L ACERO (alto)
    { id: 'TNK_001', sello: '1', status: '', type: '12L ACERO (alto)', serial: 'CCX015UT', valve: '', hydroDate: 'July 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_002', sello: '2', status: '', type: '12L ACERO (alto)', serial: 'BNZ062UT', valve: '', hydroDate: '', lastPainted: '', inInventory: true },
    { id: 'TNK_003', sello: '3', status: '', type: '12L ACERO (alto)', serial: 'BNZ017UT', valve: '', hydroDate: 'July 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_004', sello: '4', status: '', type: '12L ACERO (alto)', serial: 'CCX006UT', valve: '', hydroDate: 'July 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_005', sello: '5', status: '', type: '12L ACERO (alto)', serial: 'CCX016UT', valve: '', hydroDate: 'July 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_006', sello: '6', status: '', type: '12L ACERO (alto)', serial: 'CCX012UT', valve: '', hydroDate: 'July 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_007', sello: '7', status: '', type: '12L ACERO (alto)', serial: 'CCX018UT', valve: '', hydroDate: 'July 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_008', sello: '8', status: '', type: '12L ACERO (alto)', serial: 'BNZ044UT', valve: '', hydroDate: 'March 2024', lastPainted: '', inInventory: true },
    { id: 'TNK_009', sello: '9', status: 'Testing', type: '12L ACERO (alto)', serial: 'BNZ052UT', valve: '61.06-11', hydroDate: 'April 2026', lastPainted: 'To Paint', inInventory: true },
    { id: 'TNK_010', sello: '10', status: '', type: '12L ACERO (alto)', serial: 'CCX011UT', valve: '', hydroDate: 'July 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_011', sello: '11', status: '', type: '12L ACERO (alto)', serial: 'CCX010UT', valve: '', hydroDate: 'July 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_012', sello: '12', status: '', type: '12L ACERO (alto)', serial: 'BNZ041UT', valve: '', hydroDate: '', lastPainted: '', inInventory: true },
    { id: 'TNK_013', sello: '13', status: '', type: '12L ACERO (alto)', serial: 'BNZ004UT', valve: '', hydroDate: 'March 2024', lastPainted: '', inInventory: true },
    { id: 'TNK_014', sello: '14', status: '', type: '12L ACERO (alto)', serial: '19/0103/109', valve: '', hydroDate: 'June 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_015', sello: '15', status: '', type: '12L ACERO (alto)', serial: '19/0103/162', valve: '', hydroDate: 'June 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_016', sello: '16', status: '', type: '12L ACERO (alto)', serial: '19/0103/179', valve: '', hydroDate: 'June 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_017', sello: '17', status: '', type: '12L ACERO (alto)', serial: '19/0103/146', valve: '', hydroDate: 'June 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_018', sello: '18', status: '', type: '12L ACERO (alto)', serial: '19/0103/011', valve: '', hydroDate: 'June 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_019', sello: '19', status: '', type: '12L ACERO (alto)', serial: 'BNZ050UT', valve: '', hydroDate: 'June 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_020', sello: '20', status: 'Testing', type: '12L ACERO (alto)', serial: 'CCX021UT', valve: '61.48-10', hydroDate: 'April 2026', lastPainted: 'To Paint', inInventory: true },
    { id: 'TNK_021', sello: '21', status: '', type: '12L ACERO (alto)', serial: 'BNZ059UT', valve: '', hydroDate: 'July 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_022', sello: '22', status: '', type: '12L ACERO (alto)', serial: 'CCX027', valve: '', hydroDate: 'July 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_023', sello: '23', status: '', type: '12L ACERO (alto)', serial: 'BNZ007', valve: '', hydroDate: 'July 2022', lastPainted: '', inInventory: true },

    // Page 1 - 12L ACERO AIRE
    { id: 'TNK_024', sello: '1', status: '', type: '12L ACERO AIRE', serial: '12495461', valve: '', hydroDate: 'February 2024', lastPainted: '', inInventory: true },
    { id: 'TNK_025', sello: '2', status: 'Testing', type: '12L ACERO AIRE', serial: '12850894', valve: '61.06-11', hydroDate: 'April 2026', lastPainted: '', inInventory: true },
    { id: 'TNK_026', sello: '4', status: '', type: '12L ACERO AIRE', serial: '12184450', valve: '', hydroDate: 'February 2024', lastPainted: '', inInventory: true },
    { id: 'TNK_027', sello: '5', status: '', type: '12L ACERO AIRE', serial: '12115741', valve: '', hydroDate: 'February 2024 [1]', lastPainted: '', inInventory: true },
    { id: 'TNK_028', sello: '6', status: '', type: '12L ACERO AIRE', serial: '13923066', valve: '', hydroDate: '', lastPainted: '', inInventory: false },
    { id: 'TNK_029', sello: '7', status: 'Testing', type: '12L ACERO AIRE', serial: '12881647', valve: 'F00413', hydroDate: 'April 2026', lastPainted: '', inInventory: true },
    { id: 'TNK_030', sello: '8', status: '', type: '12L ACERO AIRE', serial: '13923071', valve: '', hydroDate: '', lastPainted: '', inInventory: true },
    { id: 'TNK_031', sello: '9', status: 'Testing', type: '12L ACERO AIRE', serial: '12495475', valve: 'H04535', hydroDate: 'April 2026', lastPainted: 'Painting', inInventory: true },
    { id: 'TNK_032', sello: '10', status: 'Testing', type: '12L ACERO AIRE', serial: '13922976', valve: 'H04516', hydroDate: 'April 2026', lastPainted: '', inInventory: true },
    { id: 'TNK_033', sello: '11', status: '', type: '12L ACERO AIRE', serial: '12881643', valve: '', hydroDate: '', lastPainted: '', inInventory: true },
    { id: 'TNK_034', sello: '12', status: '', type: '12L ACERO AIRE', serial: '13923015', valve: '', hydroDate: '', lastPainted: '', inInventory: true },
    { id: 'TNK_035', sello: '13', status: '', type: '12L ACERO AIRE', serial: '13923037', valve: '', hydroDate: '', lastPainted: '', inInventory: true },
    { id: 'TNK_036', sello: '14', status: '', type: '12L ACERO AIRE', serial: '13923067', valve: '', hydroDate: '', lastPainted: '', inInventory: true },
    { id: 'TNK_037', sello: '15', status: '', type: '12L ACERO AIRE', serial: '13922972', valve: '', hydroDate: '', lastPainted: '', inInventory: true },
    { id: 'TNK_038', sello: '16', status: '', type: '12L ACERO AIRE', serial: '13923031', valve: '', hydroDate: '', lastPainted: '', inInventory: true },
    { id: 'TNK_039', sello: '17', status: '', type: '12L ACERO AIRE', serial: '13923063', valve: '', hydroDate: '', lastPainted: '', inInventory: true },
    { id: 'TNK_040', sello: '18', status: '', type: '12L ACERO AIRE', serial: '19/0095/035', valve: '', hydroDate: 'June 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_041', sello: '19', status: 'Testing', type: '12L ACERO AIRE', serial: '13923060', valve: 'H04533', hydroDate: 'April 2026', lastPainted: 'Painting', inInventory: true },
    { id: 'TNK_042', sello: '20', status: '', type: '12L ACERO AIRE', serial: '19/0095/040', valve: '', hydroDate: 'June 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_043', sello: '21', status: 'Testing', type: '12L ACERO AIRE', serial: '13923086', valve: 'H04521', hydroDate: '', lastPainted: 'Painting', inInventory: true },
    { id: 'TNK_044', sello: '22', status: '', type: '12L ACERO AIRE', serial: '13410677', valve: '', hydroDate: '', lastPainted: '', inInventory: true },
    { id: 'TNK_045', sello: '53', status: 'Testing', type: '12L ACERO AIRE', serial: '12495462', valve: 'F00482', hydroDate: 'April 2026', lastPainted: 'Painting', inInventory: true },

    // Page 1 - 12L ACERO EANx
    { id: 'TNK_046', sello: '1', status: '', type: '12L ACERO EANx', serial: '12495461', valve: '', hydroDate: '', lastPainted: '', inInventory: false },
    { id: 'TNK_047', sello: '2', status: 'Rechazada', type: '12L ACERO EANx', serial: '12184435', valve: 'D02284', hydroDate: 'June 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_048', sello: '3', status: '', type: '12L ACERO EANx', serial: '12115713', valve: '', hydroDate: '', lastPainted: '', inInventory: true },
    { id: 'TNK_049', sello: '4', status: '', type: '12L ACERO EANx', serial: '13923069', valve: '', hydroDate: 'June 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_050', sello: '5', status: '', type: '12L ACERO EANx', serial: '13922975', valve: '', hydroDate: 'June 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_051', sello: '6', status: 'Testing', type: '12L ACERO EANx', serial: '13922977', valve: 'H04637', hydroDate: 'April 2026', lastPainted: 'Painting', inInventory: true },
    { id: 'TNK_052', sello: '7', status: '', type: '12L ACERO EANx', serial: '19/0095/038', valve: '', hydroDate: 'June 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_053', sello: '8', status: '', type: '12L ACERO EANx', serial: '13922973', valve: '', hydroDate: 'June 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_054', sello: '9', status: '', type: '12L ACERO EANx', serial: '13923001', valve: '', hydroDate: 'June 2022', lastPainted: '', inInventory: true },

    // Page 1 & 2 - 12L ALU
    { id: 'TNK_055', sello: '1', status: '', type: '12L ALU', serial: '30180', valve: '', hydroDate: 'September 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_056', sello: '2', status: '', type: '12L ALU', serial: '30181', valve: '', hydroDate: 'September 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_057', sello: '3', status: '', type: '12L ALU', serial: '30182', valve: '', hydroDate: 'September 2022', lastPainted: '', inInventory: false },
    { id: 'TNK_058', sello: '4', status: '', type: '12L ALU', serial: '30183', valve: '', hydroDate: 'September 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_059', sello: '5', status: '', type: '12L ALU', serial: '30184', valve: '', hydroDate: 'September 2022', lastPainted: '', inInventory: false },
    { id: 'TNK_060', sello: '6', status: '', type: '12L ALU', serial: '30185', valve: '', hydroDate: 'September 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_061', sello: '7', status: '', type: '12L ALU', serial: '30186', valve: '', hydroDate: 'September 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_062', sello: '8', status: '', type: '12L ALU', serial: '30187', valve: '', hydroDate: 'September 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_063', sello: '9', status: '', type: '12L ALU', serial: '30188', valve: '', hydroDate: 'September 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_064', sello: '10', status: '', type: '12L ALU', serial: '30189', valve: '', hydroDate: 'September 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_065', sello: '11', status: '', type: '12L ALU', serial: '30190', valve: '', hydroDate: 'September 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_066', sello: '12', status: '', type: '12L ALU', serial: '30191', valve: '', hydroDate: 'September 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_067', sello: '13', status: '', type: '12L ALU', serial: '30192', valve: '', hydroDate: 'September 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_068', sello: '14', status: '', type: '12L ALU', serial: '30191', valve: '', hydroDate: 'September 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_069', sello: '15', status: '', type: '12L ALU', serial: '30194', valve: '', hydroDate: 'September 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_070', sello: '16', status: '', type: '12L ALU', serial: '30195', valve: '', hydroDate: 'September 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_071', sello: '17', status: '', type: '12L ALU', serial: '30196', valve: '', hydroDate: 'September 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_072', sello: '18', status: '', type: '12L ALU', serial: '30197', valve: '', hydroDate: 'September 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_073', sello: '19', status: '', type: '12L ALU', serial: '30198', valve: '', hydroDate: 'September 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_074', sello: '20', status: '', type: '12L ALU', serial: '30199', valve: '', hydroDate: 'September 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_075', sello: '21', status: '', type: '12L ALU', serial: '30200', valve: '', hydroDate: 'September 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_076', sello: '22', status: '', type: '12L ALU', serial: '30201', valve: '', hydroDate: 'September 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_077', sello: '23', status: '', type: '12L ALU', serial: '30202', valve: '', hydroDate: 'September 2022', lastPainted: '', inInventory: true },

    // Page 2 & 3 - 15L ACERO AIRE
    { id: 'TNK_078', sello: '1', status: '', type: '15L ACERO AIRE', serial: 'no visible', valve: '', hydroDate: '', lastPainted: '', inInventory: true },
    { id: 'TNK_079', sello: '2', status: 'Testing', type: '15L ACERO AIRE', serial: '12115837', valve: 'F00472', hydroDate: 'April 2026', lastPainted: 'Enero 2026', inInventory: true },
    { id: 'TNK_080', sello: '3', status: 'Rechazada', type: '15L ACERO AIRE', serial: 'CND008', valve: '', hydroDate: 'March 2022', lastPainted: '', inInventory: false },
    { id: 'TNK_081', sello: '3', status: 'Testing', type: '15L ACERO AIRE', serial: 'ZKE104', valve: 'H05598', hydroDate: 'April 2026', lastPainted: 'Enero 2026', inInventory: true },
    { id: 'TNK_082', sello: '4', status: 'Testing', type: '15L ACERO AIRE', serial: 'ZKE107', valve: 'D01863', hydroDate: 'April 2026', lastPainted: 'Enero 2026', inInventory: true },
    { id: 'TNK_083', sello: '5', status: '', type: '15L ACERO AIRE', serial: 'CND024UT', valve: '', hydroDate: 'March 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_084', sello: '6', status: '', type: '15L ACERO AIRE', serial: 'CND014UT', valve: '', hydroDate: 'March 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_085', sello: '7', status: '', type: '15L ACERO AIRE', serial: 'CND022UT', valve: '', hydroDate: 'March 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_086', sello: '8', status: '', type: '15L ACERO AIRE', serial: '02/0940/088', valve: '', hydroDate: 'April 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_087', sello: '9', status: '', type: '15L ACERO AIRE', serial: 'BOH084', valve: '', hydroDate: 'March 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_088', sello: '10', status: '', type: '15L ACERO AIRE', serial: '95/1028/095', valve: '', hydroDate: '', lastPainted: '', inInventory: true },
    { id: 'TNK_089', sello: '11', status: '', type: '15L ACERO AIRE', serial: '12881674', valve: '', hydroDate: 'April 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_090', sello: '12', status: '', type: '15L ACERO AIRE', serial: '12881656', valve: '', hydroDate: '', lastPainted: '', inInventory: true },
    { id: 'TNK_091', sello: '13', status: '', type: '15L ACERO AIRE', serial: '1214479', valve: '', hydroDate: '', lastPainted: '', inInventory: true },
    { id: 'TNK_092', sello: '14', status: '', type: '15L ACERO AIRE', serial: '14276298', valve: '', hydroDate: '', lastPainted: '', inInventory: true },
    { id: 'TNK_093', sello: '15', status: '', type: '15L ACERO AIRE', serial: '14276333', valve: '', hydroDate: '', lastPainted: '', inInventory: true },
    { id: 'TNK_094', sello: '16', status: '', type: '15L ACERO AIRE', serial: '12881663', valve: '', hydroDate: 'April 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_095', sello: '17', status: '', type: '15L ACERO AIRE', serial: '40856022', valve: '', hydroDate: 'March 2024', lastPainted: '', inInventory: true },
    { id: 'TNK_096', sello: '18', status: '', type: '15L ACERO AIRE', serial: '50751172', valve: '', hydroDate: 'March 2024', lastPainted: '', inInventory: true },
    { id: 'TNK_097', sello: '19', status: '', type: '15L ACERO AIRE', serial: '14276289', valve: '', hydroDate: 'April 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_098', sello: '20', status: '', type: '15L ACERO AIRE', serial: '1211583 [2]', valve: '', hydroDate: '', lastPainted: '', inInventory: true },
    { id: 'TNK_099', sello: '21', status: '', type: '15L ACERO AIRE', serial: 'Not Visible', valve: '', hydroDate: '', lastPainted: '', inInventory: true },
    { id: 'TNK_100', sello: '22', status: '', type: '15L ACERO AIRE', serial: '14276330', valve: '', hydroDate: 'April 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_101', sello: '23', status: '', type: '15L ACERO AIRE', serial: '12184461', valve: '', hydroDate: 'June 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_102', sello: '24', status: '', type: '15L ACERO AIRE', serial: '12115840', valve: '', hydroDate: 'June 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_103', sello: '25', status: '', type: '15L ACERO AIRE', serial: '14276288', valve: '', hydroDate: 'April 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_104', sello: '26', status: '', type: '15L ACERO AIRE', serial: '12115828', valve: '', hydroDate: 'February 2024 [3]', lastPainted: '', inInventory: true },
    { id: 'TNK_105', sello: '27', status: '', type: '15L ACERO AIRE', serial: 'BXL164UT', valve: '', hydroDate: 'March 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_106', sello: '28', status: '', type: '15L ACERO AIRE', serial: 'ZEK114', valve: '', hydroDate: 'March 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_107', sello: '29', status: '', type: '15L ACERO AIRE', serial: '12184473', valve: '', hydroDate: 'February 2024', lastPainted: '', inInventory: true },
    { id: 'TNK_108', sello: '30', status: '', type: '15L ACERO AIRE', serial: 'BXL158UT', valve: '', hydroDate: 'February 2024', lastPainted: '', inInventory: true },
    { id: 'TNK_109', sello: '31', status: '', type: '15L ACERO AIRE', serial: 'CND007UT', valve: '', hydroDate: 'March 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_110', sello: '32', status: '', type: '15L ACERO AIRE', serial: 'BOH081', valve: '', hydroDate: 'March 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_111', sello: '33', status: '', type: '15L ACERO AIRE', serial: 'BXL161UT', valve: '', hydroDate: 'March 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_112', sello: '34', status: '', type: '15L ACERO AIRE', serial: 'no visible', valve: '', hydroDate: '', lastPainted: '', inInventory: true },
    { id: 'TNK_113', sello: '35', status: '', type: '15L ACERO AIRE', serial: '12184468', valve: '', hydroDate: 'April 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_114', sello: '36', status: '', type: '15L ACERO AIRE', serial: 'BOH072UT', valve: '', hydroDate: 'March 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_115', sello: '37', status: '', type: '15L ACERO AIRE', serial: '12881670', valve: '', hydroDate: 'June 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_116', sello: '38', status: '', type: '15L ACERO AIRE', serial: '12184471', valve: '', hydroDate: 'April 2022', lastPainted: '', inInventory: false },
    { id: 'TNK_117', sello: '39', status: 'Testing', type: '15L ACERO AIRE', serial: 'ZKE096', valve: '61.48-10', hydroDate: 'April 2026', lastPainted: 'Enero 2026', inInventory: true },
    { id: 'TNK_118', sello: '40', status: 'Testing', type: '15L ACERO AIRE', serial: 'BXL169', valve: 'D02156', hydroDate: 'April 2026', lastPainted: 'Enero 2026', inInventory: true },
    { id: 'TNK_119', sello: '41', status: '', type: '15L ACERO AIRE', serial: '14276286', valve: '', hydroDate: 'April 2022', lastPainted: 'Marzo 2026', inInventory: true },
    { id: 'TNK_120', sello: '42', status: 'Rechazada', type: '15L ACERO AIRE', serial: '14276290', valve: 'D02235', hydroDate: '', lastPainted: '', inInventory: false },
    { id: 'TNK_121', sello: '43', status: 'Rechazada', type: '15L ACERO AIRE', serial: '14276268', valve: 'D00121', hydroDate: 'April 2022', lastPainted: '', inInventory: false },
    { id: 'TNK_122', sello: '44', status: '', type: '15L ACERO AIRE', serial: '12184456', valve: '', hydroDate: 'April 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_123', sello: '45', status: '', type: '15L ACERO AIRE', serial: 'BOH109UT', valve: '', hydroDate: 'March 2024', lastPainted: '', inInventory: true },
    { id: 'TNK_124', sello: '46', status: '', type: '15L ACERO AIRE', serial: '04/085/61', valve: '', hydroDate: '', lastPainted: '', inInventory: true },
    { id: 'TNK_125', sello: '47', status: '', type: '15L ACERO AIRE', serial: 'BQH098', valve: '', hydroDate: 'March 2024 [4]', lastPainted: 'Marzo 2026', inInventory: true },
    { id: 'TNK_126', sello: '48', status: 'Testing', type: '15L ACERO AIRE', serial: 'BOH094UT', valve: 'D02290', hydroDate: 'April 2026', lastPainted: 'Enero 2026', inInventory: true },
    { id: 'TNK_127', sello: '49', status: '', type: '15L ACERO AIRE', serial: '12115830', valve: '', hydroDate: 'April 2022', lastPainted: 'Marzo 2026', inInventory: true },
    { id: 'TNK_128', sello: '50', status: '', type: '15L ACERO AIRE', serial: 'BOH080', valve: '', hydroDate: 'March 2022', lastPainted: 'Marzo 2026', inInventory: true },
    { id: 'TNK_129', sello: '51', status: '', type: '15L ACERO AIRE', serial: 'BQH079UT', valve: '', hydroDate: '', lastPainted: '', inInventory: true },
    { id: 'TNK_130', sello: '52', status: 'Rechazada', type: '15L ACERO AIRE', serial: 'CND005', valve: 'E00411', hydroDate: 'April 2022', lastPainted: '', inInventory: false },
    { id: 'TNK_131', sello: '54', status: '', type: '15L ACERO AIRE', serial: 'BOH110', valve: '', hydroDate: 'March 2024 [5]', lastPainted: '', inInventory: true },
    { id: 'TNK_132', sello: '55', status: 'Rechazada', type: '15L ACERO AIRE', serial: '12..1667', valve: 'F02764', hydroDate: '', lastPainted: '', inInventory: false },
    { id: 'TNK_133', sello: '56', status: '', type: '15L ACERO AIRE', serial: 'BOH089', valve: '', hydroDate: 'March 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_134', sello: '57', status: '', type: '15L ACERO AIRE', serial: '14276284', valve: '', hydroDate: 'April 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_135', sello: '58', status: '', type: '15L ACERO AIRE', serial: 'no visible', valve: '', hydroDate: '', lastPainted: '', inInventory: true },
    { id: 'TNK_136', sello: '59', status: '', type: '15L ACERO AIRE', serial: 'BOH083', valve: '', hydroDate: 'March 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_137', sello: '60', status: '', type: '15L ACERO AIRE', serial: '0110CTME13', valve: '', hydroDate: 'Marzo 2026', lastPainted: '', inInventory: true },
    { id: 'TNK_138', sello: '61', status: '', type: '15L ACERO AIRE', serial: '14276306', valve: '', hydroDate: 'April 2022', lastPainted: 'Marzo 2026', inInventory: true },
    { id: 'TNK_139', sello: '62', status: '', type: '15L ACERO AIRE', serial: 'CND018UT', valve: '', hydroDate: 'March 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_140', sello: '63', status: '', type: '15L ACERO AIRE', serial: 'BOH082', valve: '', hydroDate: '', lastPainted: '', inInventory: true },
    { id: 'TNK_141', sello: '64', status: '', type: '15L ACERO AIRE', serial: 'BOH071', valve: '', hydroDate: 'March 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_142', sello: '65', status: '', type: '15L ACERO AIRE', serial: 'BOH093', valve: '', hydroDate: 'March 2022', lastPainted: '', inInventory: true },

    // Page 3 - 15L ACERO EANx
    { id: 'TNK_143', sello: '1', status: 'Testing', type: '15L ACERO EANx', serial: '12184469', valve: 'D02232', hydroDate: 'April 2026', lastPainted: '', inInventory: true },
    { id: 'TNK_144', sello: '2', status: 'Testing', type: '15L ACERO EANx', serial: '14276328', valve: 'D02282', hydroDate: 'April 2026', lastPainted: '', inInventory: true },
    { id: 'TNK_145', sello: '3', status: 'Testing', type: '15L ACERO EANx', serial: '14276331', valve: 'D02128', hydroDate: 'April 2026', lastPainted: '', inInventory: true },
    { id: 'TNK_146', sello: '4', status: 'Testing', type: '15L ACERO EANx', serial: '12184478', valve: 'D02294', hydroDate: 'April 2026', lastPainted: '', inInventory: true },
    { id: 'TNK_147', sello: '5', status: '', type: '15L ACERO EANx', serial: '14276296', valve: '', hydroDate: 'June 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_148', sello: '6', status: '', type: '15L ACERO EANx', serial: '12184470', valve: '', hydroDate: 'June 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_149', sello: '7', status: '', type: '15L ACERO EANx', serial: 'BOH090UT', valve: '', hydroDate: 'February 2024 [6]', lastPainted: '', inInventory: true },
    { id: 'TNK_150', sello: '8', status: '', type: '15L ACERO EANx', serial: '14455487', valve: '', hydroDate: '', lastPainted: '', inInventory: true },
    { id: 'TNK_151', sello: '9', status: '', type: '15L ACERO EANx', serial: '13922825', valve: '', hydroDate: 'June 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_152', sello: '10', status: 'Testing', type: '15L ACERO EANx', serial: '14276274', valve: 'D02275', hydroDate: 'April 2026', lastPainted: 'Painting', inInventory: true },
    { id: 'TNK_153', sello: '11', status: '', type: '15L ACERO EANx', serial: '23/0012/062', valve: '', hydroDate: 'January 2023', lastPainted: '', inInventory: true },
    { id: 'TNK_154', sello: '12', status: '', type: '15L ACERO EANx', serial: '23/0012/138', valve: '', hydroDate: 'January 2023', lastPainted: '', inInventory: true },
    { id: 'TNK_155', sello: '13', status: '', type: '15L ACERO EANx', serial: '23/0012/029', valve: '', hydroDate: 'January 2023', lastPainted: '', inInventory: true },
    { id: 'TNK_156', sello: '14', status: '', type: '15L ACERO EANx', serial: '23/0012/157', valve: '', hydroDate: 'January 2023', lastPainted: '', inInventory: true },
    { id: 'TNK_157', sello: '15', status: '', type: '15L ACERO EANx', serial: 'OBY174UT', valve: '', hydroDate: 'February 2024', lastPainted: '', inInventory: true },
    { id: 'TNK_158', sello: '16', status: '', type: '15L ACERO EANx', serial: 'OBY010UT', valve: '', hydroDate: 'February 2024', lastPainted: '', inInventory: true },
    { id: 'TNK_159', sello: '17', status: 'Rechazada', type: '15L ACERO EANx', serial: '12115844', valve: 'D02137', hydroDate: 'June 2022', lastPainted: '', inInventory: false },
    { id: 'TNK_160', sello: '18', status: '', type: '15L ACERO EANx', serial: '23/0012/016', valve: '', hydroDate: 'January 2023', lastPainted: '', inInventory: true },
    { id: 'TNK_161', sello: '19', status: '', type: '15L ACERO EANx', serial: '13922915', valve: '', hydroDate: 'June 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_162', sello: '20', status: '', type: '15L ACERO EANx', serial: 'OBY017UT', valve: '', hydroDate: '', lastPainted: '', inInventory: true },
    { id: 'TNK_163', sello: '21', status: 'Testing', type: '15L ACERO EANx', serial: 'no visible', valve: '119.44-17', hydroDate: '', lastPainted: '', inInventory: true },
    { id: 'TNK_164', sello: '22', status: 'Rechazada', type: '15L ACERO EANx', serial: 'BXL157', valve: 'D02292', hydroDate: 'March 2022', lastPainted: '', inInventory: false },
    { id: 'TNK_165', sello: '23', status: '', type: '15L ACERO EANx', serial: '23/0012/067', valve: '', hydroDate: '', lastPainted: '', inInventory: true },
    { id: 'TNK_166', sello: '24', status: '', type: '15L ACERO EANx', serial: '13922913', valve: '', hydroDate: '', lastPainted: '', inInventory: true },
    { id: 'TNK_167', sello: '25', status: '', type: '15L ACERO EANx', serial: '13922921', valve: '', hydroDate: 'June 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_168', sello: '26', status: '', type: '15L ACERO EANx', serial: '1445549', valve: '', hydroDate: '', lastPainted: '', inInventory: true },
    { id: 'TNK_169', sello: '27', status: '', type: '15L ACERO EANx', serial: '23/0012/032', valve: '', hydroDate: '', lastPainted: '', inInventory: true },

    // Page 3 & 4 - No encontrado en MM
    { id: 'TNK_170', sello: '', status: '', type: 'No econtrado en MM', serial: '12/1428/072', valve: '', hydroDate: 'March 2024', lastPainted: '', inInventory: true },
    { id: 'TNK_171', sello: '', status: '', type: 'No econtrado en MM', serial: '12115812', valve: '', hydroDate: 'April 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_172', sello: '', status: '', type: 'No econtrado en MM', serial: '12115813', valve: '', hydroDate: 'April 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_173', sello: '', status: '', type: 'No econtrado en MM', serial: '12115839', valve: '', hydroDate: 'April 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_174', sello: '', status: '', type: 'No econtrado en MM', serial: '12115842', valve: '', hydroDate: 'April 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_175', sello: '', status: '', type: 'No econtrado en MM', serial: '12115845', valve: '', hydroDate: 'April 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_176', sello: '', status: '', type: 'No econtrado en MM', serial: '12115847', valve: '', hydroDate: 'April 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_177', sello: '', status: '', type: 'No econtrado en MM', serial: '13409992', valve: '', hydroDate: 'March 2024', lastPainted: '', inInventory: true },
    { id: 'TNK_178', sello: '', status: '', type: 'No econtrado en MM', serial: '13922910', valve: '', hydroDate: 'June 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_179', sello: '', status: '', type: 'No econtrado en MM', serial: '13923068', valve: '', hydroDate: 'April 2026', lastPainted: '', inInventory: true },
    { id: 'TNK_180', sello: '', status: '', type: 'No econtrado en MM', serial: '14276275', valve: '', hydroDate: 'April 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_181', sello: '', status: '', type: 'No econtrado en MM', serial: '14276291', valve: '', hydroDate: 'April 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_182', sello: '', status: '', type: 'No econtrado en MM', serial: '14276326', valve: '', hydroDate: 'April 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_183', sello: '', status: '', type: 'No econtrado en MM', serial: '14276383', valve: '', hydroDate: 'April 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_184', sello: '', status: '', type: 'No econtrado en MM', serial: '14455481', valve: '', hydroDate: 'June 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_185', sello: '', status: '', type: 'No econtrado en MM', serial: '14455490', valve: '', hydroDate: 'April 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_186', sello: '', status: '', type: 'No econtrado en MM', serial: '14455493', valve: '', hydroDate: 'June 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_187', sello: '', status: '', type: 'No econtrado en MM', serial: '14455496', valve: '', hydroDate: 'June 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_188', sello: '', status: '', type: 'No econtrado en MM', serial: '14455498', valve: '', hydroDate: 'April 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_189', sello: '', status: '', type: 'No econtrado en MM', serial: '19/0095/042', valve: '', hydroDate: 'June 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_190', sello: '', status: '', type: 'No econtrado en MM', serial: '19/0095/043', valve: '', hydroDate: 'June 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_191', sello: '', status: '', type: 'No econtrado en MM', serial: '19/0095/044', valve: '', hydroDate: 'June 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_192', sello: '', status: '', type: 'No econtrado en MM', serial: '2696', valve: '', hydroDate: 'June 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_193', sello: '', status: '', type: 'No econtrado en MM', serial: '2698', valve: '', hydroDate: 'June 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_194', sello: '', status: '', type: 'No econtrado en MM', serial: '4139', valve: '', hydroDate: 'June 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_195', sello: '', status: '', type: 'No econtrado en MM', serial: '5735', valve: '', hydroDate: 'June 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_196', sello: '', status: '', type: 'No econtrado en MM', serial: '5797', valve: '', hydroDate: 'June 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_197', sello: '', status: '', type: 'No econtrado en MM', serial: '6779', valve: '', hydroDate: 'June 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_198', sello: '', status: '', type: 'No econtrado en MM', serial: '7308', valve: '', hydroDate: 'June 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_199', sello: '', status: '', type: 'No econtrado en MM', serial: '91/357/068', valve: '', hydroDate: 'February 2024', lastPainted: '', inInventory: true },
    { id: 'TNK_200', sello: '', status: '', type: 'No econtrado en MM', serial: '91/357/139', valve: '', hydroDate: 'February 2024', lastPainted: '', inInventory: true },
    { id: 'TNK_201', sello: '', status: '', type: 'No econtrado en MM', serial: '93/1506', valve: '', hydroDate: 'April 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_202', sello: '', status: '', type: 'No econtrado en MM', serial: '95/1023/045', valve: '', hydroDate: 'April 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_203', sello: '', status: '', type: 'No econtrado en MM', serial: 'AZF079', valve: '', hydroDate: 'March 2024', lastPainted: '', inInventory: true },
    { id: 'TNK_204', sello: '', status: '', type: 'No econtrado en MM', serial: 'BNZ048', valve: '', hydroDate: 'July 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_205', sello: '', status: '', type: 'No econtrado en MM', serial: 'BNZ051', valve: '', hydroDate: 'July 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_206', sello: '', status: '', type: 'No econtrado en MM', serial: 'BOH080', valve: '', hydroDate: 'March 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_207', sello: '', status: '', type: 'No econtrado en MM', serial: 'BOH087', valve: '', hydroDate: 'March 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_208', sello: '', status: '', type: 'No econtrado en MM', serial: 'BXL129', valve: '', hydroDate: 'March 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_209', sello: '', status: '', type: 'No econtrado en MM', serial: 'BXL154', valve: '', hydroDate: 'March 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_210', sello: '', status: '', type: 'No econtrado en MM', serial: 'BXL159', valve: '', hydroDate: 'March 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_211', sello: '', status: '', type: 'No econtrado en MM', serial: 'BXL160', valve: '', hydroDate: 'March 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_212', sello: '', status: '', type: 'No econtrado en MM', serial: 'GV0002191', valve: '', hydroDate: 'March 2024', lastPainted: '', inInventory: true },
    { id: 'TNK_213', sello: '', status: '', type: 'No econtrado en MM', serial: 'OEH091', valve: '', hydroDate: 'March 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_214', sello: '', status: '', type: 'No econtrado en MM', serial: 'OEH093', valve: '', hydroDate: 'March 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_215', sello: '', status: '', type: 'No econtrado en MM', serial: 'P3258V', valve: '', hydroDate: 'June 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_216', sello: '', status: '', type: 'No econtrado en MM', serial: 'P54894', valve: '', hydroDate: 'June 2022', lastPainted: '', inInventory: true },
    { id: 'TNK_217', sello: '', status: '', type: 'No econtrado en MM', serial: 'PP66838', valve: '', hydroDate: 'March 2024', lastPainted: '', inInventory: true },
    { id: 'TNK_218', sello: '', status: '', type: 'No econtrado en MM', serial: 'UPA109', valve: '', hydroDate: 'March 2024', lastPainted: '', inInventory: true },
    { id: 'TNK_219', sello: '', status: '', type: 'No econtrado en MM', serial: 'ZKE113', valve: '', hydroDate: 'March 2022', lastPainted: '', inInventory: true }
];

// Initialize Firestore Listener
window.initTankInventoryDB = function() {
    if (typeof db === 'undefined' || !db) return;
    try {
        db.collection(INTERNAL_DB).doc('tank_inventory').onSnapshot(doc => {
            if (doc.exists) {
                const data = doc.data();
                // If existing data has fewer tanks than initial full set, update with complete set
                if (Array.isArray(data.tanks) && data.tanks.length >= 100) {
                    window.tankInventoryList = data.tanks;
                } else {
                    window.tankInventoryList = [...window.INITIAL_TANK_DATA];
                    db.collection(INTERNAL_DB).doc('tank_inventory').set({
                        tanks: window.tankInventoryList,
                        lastUpdated: Date.now()
                    });
                }
            } else {
                window.tankInventoryList = [...window.INITIAL_TANK_DATA];
                db.collection(INTERNAL_DB).doc('tank_inventory').set({
                    tanks: window.tankInventoryList,
                    lastUpdated: Date.now()
                });
            }
            window.renderTankInventoryUI();
        }, err => {
            console.warn("Tank inventory db sync warning:", err);
            if (window.tankInventoryList.length === 0) {
                window.tankInventoryList = [...window.INITIAL_TANK_DATA];
                window.renderTankInventoryUI();
            }
        });
    } catch(e) {
        console.warn("Error initializing tank inventory db:", e);
        if (window.tankInventoryList.length === 0) {
            window.tankInventoryList = [...window.INITIAL_TANK_DATA];
            window.renderTankInventoryUI();
        }
    }
};

// Open the Tank Inventory Modal
window.openTankInventoryModal = function() {
    const modal = document.getElementById('tank-inventory-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    window.renderTankInventoryUI();
};

// Close Modal
window.closeTankInventoryModal = function() {
    const modal = document.getElementById('tank-inventory-modal');
    if (modal) modal.classList.add('hidden');
};

// Save Tank Inventory to Firestore
window.saveTankInventoryDB = async function() {
    try {
        if (typeof db !== 'undefined' && db) {
            await db.collection(INTERNAL_DB).doc('tank_inventory').set({
                tanks: window.tankInventoryList,
                lastUpdated: Date.now()
            });
        }
    } catch(e) {
        console.error("Error saving tank inventory:", e);
    }
};

// Column Sorting Handler
window.toggleTankSort = function(key) {
    if (window.tankSortState.key === key) {
        if (window.tankSortState.asc) {
            window.tankSortState.asc = false;
        } else {
            // Reset to default original order
            window.tankSortState.key = null;
            window.tankSortState.asc = true;
        }
    } else {
        window.tankSortState.key = key;
        window.tankSortState.asc = true;
    }
    window.renderTankInventoryUI();
};

window.tankTableEditMode = false;

// Filter Popover handlers
window.toggleTankFilterPopover = function() {
    const pop = document.getElementById('tank-filter-popover');
    if (pop) pop.classList.toggle('hidden');
};

window.onTankFilterChange = function() {
    const speciesVal = document.getElementById('tank-filter-species')?.value || 'ALL';
    const statusVal = document.getElementById('tank-filter-status')?.value || 'ALL';
    const invVal = document.getElementById('tank-filter-inventory')?.value || 'ALL';

    const hasActiveFilters = (speciesVal !== 'ALL') || (statusVal !== 'ALL') || (invVal !== 'ALL');
    const badge = document.getElementById('tank-active-filter-badge');
    const btn = document.getElementById('btn-tank-filter-popover');
    
    if (badge) {
        badge.classList.toggle('hidden', !hasActiveFilters);
    }
    if (btn) {
        if (hasActiveFilters) {
            btn.className = 'px-3 py-1.5 bg-emerald-50 text-emerald-800 border-emerald-300 font-black rounded-xl text-xs transition-all flex items-center gap-1.5 border shrink-0';
        } else {
            btn.className = 'px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border border-slate-300 shrink-0';
        }
    }

    window.renderTankInventoryUI();
};

window.resetTankFilters = function() {
    const s1 = document.getElementById('tank-filter-species');
    const s2 = document.getElementById('tank-filter-status');
    const s3 = document.getElementById('tank-filter-inventory');
    if (s1) s1.value = 'ALL';
    if (s2) s2.value = 'ALL';
    if (s3) s3.value = 'ALL';
    window.onTankFilterChange();
};

// Close popover when clicking outside
document.addEventListener('click', function(e) {
    const container = document.getElementById('tank-filter-popover-container');
    const pop = document.getElementById('tank-filter-popover');
    if (container && pop && !container.contains(e.target) && !pop.classList.contains('hidden')) {
        pop.classList.add('hidden');
    }
});

// Toggle Table Edit Mode (protects against misclicks)
window.toggleTankTableEditMode = function() {
    window.tankTableEditMode = !window.tankTableEditMode;
    const btn = document.getElementById('btn-toggle-tank-edit-mode');
    if (btn) {
        if (window.tankTableEditMode) {
            btn.className = 'px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-900 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-sm shrink-0 ring-2 ring-amber-300';
            btn.innerHTML = '<span>🔓 Modo Edición Activo</span>';
        } else {
            btn.className = 'px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border border-slate-300 shrink-0';
            btn.innerHTML = '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg><span>Editar en Tabla</span>';
        }
    }
    window.renderTankInventoryUI();
};

// Render Main Tank Inventory UI
window.renderTankInventoryUI = function() {
    const tbody = document.getElementById('tank-inventory-tbody');
    if (!tbody) return;

    let list = [...(window.tankInventoryList || [])];

    // Read Filter Values
    const searchVal = (document.getElementById('tank-filter-search')?.value || '').trim().toLowerCase();
    const speciesVal = document.getElementById('tank-filter-species')?.value || 'ALL';
    const statusVal = document.getElementById('tank-filter-status')?.value || 'ALL';
    const invVal = document.getElementById('tank-filter-inventory')?.value || 'ALL';

    // 1. Search Query Filter
    if (searchVal) {
        list = list.filter(t => {
            const matchSello = String(t.sello || '').toLowerCase().includes(searchVal);
            const matchSerial = String(t.serial || '').toLowerCase().includes(searchVal);
            const matchValve = String(t.valve || '').toLowerCase().includes(searchVal);
            const matchType = String(t.type || '').toLowerCase().includes(searchVal);
            const matchStatus = String(t.status || '').toLowerCase().includes(searchVal);
            const matchHydro = String(t.hydroDate || '').toLowerCase().includes(searchVal);
            const matchPaint = String(t.lastPainted || '').toLowerCase().includes(searchVal);
            return matchSello || matchSerial || matchValve || matchType || matchStatus || matchHydro || matchPaint;
        });
    }

    // 2. Species Filter
    if (speciesVal !== 'ALL') {
        list = list.filter(t => {
            const tType = String(t.type || '').toLowerCase().trim();
            if (speciesVal === '12L_ALTO') return tType.includes('alto');
            if (speciesVal === '12L_AIRE') return tType.includes('12l') && tType.includes('aire');
            if (speciesVal === '12L_EANX') return tType.includes('12l') && tType.includes('eanx');
            if (speciesVal === '12L_ALU') return tType.includes('alu');
            if (speciesVal === '15L_AIRE') return tType.includes('15l') && tType.includes('aire');
            if (speciesVal === '15L_EANX') return tType.includes('15l') && tType.includes('eanx');
            if (speciesVal === 'NO_ENCONTRADO') return tType.includes('no econtrado') || tType.includes('no encontrado');
            return true;
        });
    }

    // 3. Status Filter
    if (statusVal !== 'ALL') {
        list = list.filter(t => {
            const st = (t.status || '').trim();
            if (statusVal === 'OPERATIVA') return !st;
            return st.toLowerCase() === statusVal.toLowerCase();
        });
    }

    // 4. Inventory Filter
    if (invVal !== 'ALL') {
        list = list.filter(t => {
            if (invVal === 'IN_INV') return t.inInventory === true;
            if (invVal === 'NOT_INV') return !t.inInventory;
            return true;
        });
    }

    // Apply Column Sorting if active
    if (window.tankSortState.key) {
        const k = window.tankSortState.key;
        const mult = window.tankSortState.asc ? 1 : -1;

        list.sort((a, b) => {
            let valA = a[k] !== undefined && a[k] !== null ? a[k] : '';
            let valB = b[k] !== undefined && b[k] !== null ? b[k] : '';

            // Numeric comparison for sello
            if (k === 'sello') {
                const numA = parseInt(valA, 10);
                const numB = parseInt(valB, 10);
                if (!isNaN(numA) && !isNaN(numB)) {
                    return (numA - numB) * mult;
                }
            }

            // Boolean comparison for inInventory
            if (k === 'inInventory') {
                return ((valA === true ? 1 : 0) - (valB === true ? 1 : 0)) * mult;
            }

            return String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: 'base' }) * mult;
        });
    }

    // Update Sort Indicators in the Table Header
    const sortCols = ['sello', 'status', 'type', 'serial', 'valve', 'hydroDate', 'lastPainted', 'inInventory'];
    sortCols.forEach(colKey => {
        const iconEl = document.getElementById(`tank-sort-icon-${colKey}`);
        if (iconEl) {
            if (window.tankSortState.key === colKey) {
                iconEl.innerHTML = window.tankSortState.asc ? '▲' : '▼';
                iconEl.className = 'text-[9px] text-emerald-800 font-black inline ml-1';
            } else {
                iconEl.innerHTML = '⇅';
                iconEl.className = 'text-[9px] text-slate-400 inline ml-1';
            }
        }
    });

    // Update Counter
    const countEl = document.getElementById('tank-inventory-count');
    if (countEl) {
        countEl.innerText = `${list.length} botellas`;
    }

    // Populate Table
    if (list.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center py-10 text-slate-400 font-bold italic">
                    No se encontraron botellas con los filtros seleccionados.
                </td>
            </tr>
        `;
        return;
    }

    const isEditMode = !!window.tankTableEditMode;

    tbody.innerHTML = list.map((t) => {
        const st = t.status || '';
        const tType = String(t.type || '').trim();
        const tTypeLower = tType.toLowerCase();

        // 2) Distinct colored tag/badge for each tank 'species' in the Tipo column
        let speciesTag = `<span class="px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-300 inline-block">${tType}</span>`;

        if (tTypeLower.includes('alto')) {
            speciesTag = `<span class="px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-100 text-blue-900 border border-blue-300 inline-block">12L ACERO (alto)</span>`;
        } else if (tTypeLower.includes('12l') && tTypeLower.includes('aire')) {
            speciesTag = `<span class="px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-800 border border-slate-300 inline-block">12L ACERO AIRE</span>`;
        } else if (tTypeLower.includes('12l') && tTypeLower.includes('eanx')) {
            speciesTag = `<span class="px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 inline-block">12L ACERO EANx</span>`;
        } else if (tTypeLower.includes('alu')) {
            speciesTag = `<span class="px-2 py-0.5 rounded-md text-[11px] font-bold bg-cyan-100 text-cyan-900 border border-cyan-300 inline-block">12L ALU</span>`;
        } else if (tTypeLower.includes('15l') && tTypeLower.includes('aire')) {
            speciesTag = `<span class="px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300 inline-block">15L ACERO AIRE</span>`;
        } else if (tTypeLower.includes('15l') && tTypeLower.includes('eanx')) {
            speciesTag = `<span class="px-2 py-0.5 rounded-md text-[11px] font-bold bg-teal-100 text-teal-900 border border-teal-300 inline-block">15L ACERO EANx</span>`;
        } else if (tTypeLower.includes('no econtrado') || tTypeLower.includes('no encontrado')) {
            speciesTag = `<span class="px-2 py-0.5 rounded-md text-[11px] font-medium bg-gray-100 text-gray-500 border border-gray-300 italic inline-block">No encontrado en MM</span>`;
        }

        // Highlight rejected rows softly
        let rowClass = 'bg-white hover:bg-slate-50';
        if (st === 'Rechazada') {
            rowClass = 'bg-rose-50/70 hover:bg-rose-100/70 text-rose-950';
        }

        // Status badge styling in read-only mode
        let statusBadge = '<span class="text-slate-300 text-xs">—</span>';
        if (st === 'Testing') {
            statusBadge = '<span class="bg-amber-100 text-amber-900 border border-amber-300 font-black px-2 py-0.5 rounded text-[11px]">Testing</span>';
        } else if (st === 'Rechazada') {
            statusBadge = '<span class="bg-rose-200 text-rose-950 border border-rose-400 font-black px-2 py-0.5 rounded text-[11px]">Rechazada</span>';
        } else if (st === 'Painting') {
            statusBadge = '<span class="bg-sky-100 text-sky-900 border border-sky-300 font-black px-2 py-0.5 rounded text-[11px]">Painting</span>';
        }

        // INLINE EDIT MODE CONTROLS
        if (isEditMode) {
            const statusOptions = `
                <option value="" ${!st ? 'selected' : ''}>—</option>
                <option value="Testing" ${st === 'Testing' ? 'selected' : ''}>Testing</option>
                <option value="Painting" ${st === 'Painting' ? 'selected' : ''}>Painting</option>
                <option value="Rechazada" ${st === 'Rechazada' ? 'selected' : ''}>Rechazada</option>
            `;
            let statusSelectClass = 'bg-white text-slate-700 border-slate-300';
            if (st === 'Testing') statusSelectClass = 'bg-amber-100 text-amber-900 border-amber-300 font-bold';
            else if (st === 'Rechazada') statusSelectClass = 'bg-rose-100 text-rose-900 border-rose-300 font-bold';
            else if (st === 'Painting') statusSelectClass = 'bg-sky-100 text-sky-900 border-sky-300 font-bold';

            const typeOptions = [
                '12L ACERO (alto)',
                '12L ACERO AIRE',
                '12L ACERO EANx',
                '12L ALU',
                '15L ACERO AIRE',
                '15L ACERO EANx',
                'No econtrado en MM',
                '18L ACERO',
                '7L ALU'
            ];
            if (!typeOptions.includes(tType) && tType) typeOptions.push(tType);

            return `
                <tr class="border-b border-slate-200 ${rowClass} transition-colors">
                    <!-- 1. Sello (Non-editable) -->
                    <td class="py-1 px-3 border-r border-slate-200 font-mono font-black text-slate-900 text-xs">
                        ${t.sello || ''}
                    </td>

                    <!-- 2. Status (Editable) -->
                    <td class="py-1 px-2 border-r border-slate-200">
                        <select onchange="window.updateTankField('${t.id}', 'status', this.value)" class="text-[11px] font-bold px-2 py-0.5 rounded border ${statusSelectClass} cursor-pointer outline-none transition-all w-full shadow-xs">
                            ${statusOptions}
                        </select>
                    </td>

                    <!-- 3. Tipo (Editable) -->
                    <td class="py-1 px-2 border-r border-slate-200">
                        <select onchange="window.updateTankField('${t.id}', 'type', this.value)" class="text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded px-1.5 py-0.5 w-full cursor-pointer outline-none shadow-xs">
                            ${typeOptions.map(opt => `<option value="${opt}" ${opt === tType ? 'selected' : ''}>${opt}</option>`).join('')}
                        </select>
                    </td>

                    <!-- 4. No. Serie (Editable) -->
                    <td class="py-1 px-2 border-r border-slate-200">
                        <input type="text" value="${t.serial || ''}" placeholder="No serie" onchange="window.updateTankField('${t.id}', 'serial', this.value)" class="font-mono font-bold text-xs px-1.5 py-0.5 rounded border border-slate-300 focus:border-emerald-500 bg-white w-full outline-none shadow-xs">
                    </td>

                    <!-- 5. Griferia (Editable) -->
                    <td class="py-1 px-2 border-r border-slate-200">
                        <input type="text" value="${t.valve || ''}" placeholder="—" onchange="window.updateTankField('${t.id}', 'valve', this.value)" class="font-mono text-xs px-1.5 py-0.5 rounded border border-slate-300 focus:border-emerald-500 bg-white w-full outline-none shadow-xs ${t.valve ? 'font-bold text-emerald-800' : ''}">
                    </td>

                    <!-- 6. Fecha Hydrostatico (Editable) -->
                    <td class="py-1 px-2 border-r border-slate-200">
                        <input type="text" value="${t.hydroDate || ''}" placeholder="—" onchange="window.updateTankField('${t.id}', 'hydroDate', this.value)" class="text-xs px-1.5 py-0.5 rounded border border-slate-300 focus:border-emerald-500 bg-white w-full outline-none font-medium shadow-xs">
                    </td>

                    <!-- 7. Last Painted (Editable) -->
                    <td class="py-1 px-2 border-r border-slate-200">
                        <input type="text" value="${t.lastPainted || ''}" placeholder="—" onchange="window.updateTankField('${t.id}', 'lastPainted', this.value)" class="text-xs px-1.5 py-0.5 rounded border border-slate-300 focus:border-emerald-500 bg-white w-full outline-none font-medium shadow-xs">
                    </td>

                    <!-- 8. Inventario -->
                    <td class="py-1 px-2 text-center border-r border-slate-200">
                        <input type="checkbox" onchange="window.toggleTankInventory('${t.id}', this.checked)" ${t.inInventory ? 'checked' : ''} class="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer">
                    </td>

                    <!-- Actions -->
                    <td class="py-1 px-1 text-center no-print">
                        <button onclick="window.deleteTank('${t.id}')" class="p-1 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors" title="Eliminar botella">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </button>
                    </td>
                </tr>
            `;
        }

        // READ-ONLY / VIEWING MODE (Crisp, protected from accidental misclicks)
        return `
            <tr class="border-b border-slate-200 ${rowClass} transition-colors group">
                <!-- 1. Sello (Non-editable, clean text) -->
                <td class="py-2 px-3 border-r border-slate-200/80 font-mono font-black text-slate-900 text-xs">
                    ${t.sello || ''}
                </td>

                <!-- 2. Status -->
                <td class="py-2 px-3 border-r border-slate-200/80">
                    ${statusBadge}
                </td>

                <!-- 3. Tipo (Distinct colored tag) -->
                <td class="py-2 px-3 border-r border-slate-200/80">
                    ${speciesTag}
                </td>

                <!-- 4. No. Serie -->
                <td class="py-2 px-3 border-r border-slate-200/80 font-mono font-bold text-xs text-slate-900">
                    ${t.serial || '—'}
                </td>

                <!-- 5. Griferia -->
                <td class="py-2 px-3 border-r border-slate-200/80 font-mono text-xs text-slate-800">
                    ${t.valve ? `<span class="bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono font-bold px-1.5 py-0.5 rounded">${t.valve}</span>` : ''}
                </td>

                <!-- 6. Fecha Hydrostatico -->
                <td class="py-2 px-3 border-r border-slate-200/80 text-xs font-medium text-slate-700">
                    ${t.hydroDate || ''}
                </td>

                <!-- 7. Last Painted -->
                <td class="py-2 px-3 border-r border-slate-200/80 text-xs text-slate-700">
                    ${t.lastPainted || ''}
                </td>

                <!-- 8. Inventario (20 Dic 2025) -->
                <td class="py-2 px-3 text-center border-r border-slate-200/80">
                    <input type="checkbox" onchange="window.toggleTankInventory('${t.id}', this.checked)" ${t.inInventory ? 'checked' : ''} class="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer">
                </td>

                <!-- Row Actions (Edit modal trigger) -->
                <td class="py-2 px-1 text-center no-print">
                    <button onclick="window.openEditTankModal('${t.id}')" class="p-1 text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 rounded transition-colors opacity-70 group-hover:opacity-100" title="Editar datos">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
};

// Generic Field Updater for Direct Inline Editing
window.updateTankField = function(tankId, field, value) {
    const tank = window.tankInventoryList.find(t => t.id === tankId);
    if (!tank) return;
    tank[field] = typeof value === 'string' ? value.trim() : value;
    if (field === 'status') {
        window.renderTankInventoryUI();
    }
    window.saveTankInventoryDB();
};

// Quick Inventory Checkbox Toggle
window.toggleTankInventory = function(tankId, isChecked) {
    const tank = window.tankInventoryList.find(t => t.id === tankId);
    if (!tank) return;
    tank.inInventory = isChecked;
    window.renderTankInventoryUI();
    window.saveTankInventoryDB();
};

// Open Modal to Add/Edit Tank
window.openEditTankModal = function(tankId = null) {
    window.activeTankEditId = tankId;
    const modal = document.getElementById('tank-edit-modal');
    if (!modal) return;

    const titleEl = document.getElementById('tank-edit-modal-title');

    if (tankId) {
        const tank = window.tankInventoryList.find(t => t.id === tankId);
        if (!tank) return;
        if (titleEl) titleEl.innerText = `Editar Botella ${tank.sello ? '#' + tank.sello : ''} (${tank.serial})`;

        document.getElementById('tank-input-sello').value = tank.sello || '';
        document.getElementById('tank-input-type').value = tank.type || '12L ACERO AIRE';
        document.getElementById('tank-input-serial').value = tank.serial || '';
        document.getElementById('tank-input-valve').value = tank.valve || '';
        document.getElementById('tank-input-status').value = tank.status || '';
        document.getElementById('tank-input-hydro').value = tank.hydroDate || '';
        document.getElementById('tank-input-paint').value = tank.lastPainted || '';
        document.getElementById('tank-input-inventory').checked = tank.inInventory !== false;
    } else {
        if (titleEl) titleEl.innerText = 'Registrar Nueva Botella';
        document.getElementById('tank-input-sello').value = '';
        document.getElementById('tank-input-type').value = '12L ACERO AIRE';
        document.getElementById('tank-input-serial').value = '';
        document.getElementById('tank-input-valve').value = '';
        document.getElementById('tank-input-status').value = '';
        document.getElementById('tank-input-hydro').value = '';
        document.getElementById('tank-input-paint').value = '';
        document.getElementById('tank-input-inventory').checked = true;
    }

    modal.classList.remove('hidden');
};

// Close Edit Modal
window.closeEditTankModal = function() {
    const modal = document.getElementById('tank-edit-modal');
    if (modal) modal.classList.add('hidden');
};

// Save Tank from Form
window.saveTankForm = function() {
    const sello = document.getElementById('tank-input-sello').value.trim();
    const type = document.getElementById('tank-input-type').value.trim();
    const serial = document.getElementById('tank-input-serial').value.trim();
    const valve = document.getElementById('tank-input-valve').value.trim();
    const status = document.getElementById('tank-input-status').value;
    const hydroDate = document.getElementById('tank-input-hydro').value.trim();
    const lastPainted = document.getElementById('tank-input-paint').value.trim();
    const inInventory = document.getElementById('tank-input-inventory').checked;

    if (!serial && !sello) {
        if (typeof showAppAlert === 'function') {
            showAppAlert("Indica al menos el Sello o el Número de Serie de la botella.");
        } else {
            alert("Indica al menos el Sello o el Número de Serie de la botella.");
        }
        return;
    }

    if (window.activeTankEditId) {
        const tank = window.tankInventoryList.find(t => t.id === window.activeTankEditId);
        if (tank) {
            tank.sello = sello;
            tank.type = type;
            tank.serial = serial;
            tank.valve = valve;
            tank.status = status;
            tank.hydroDate = hydroDate;
            tank.lastPainted = lastPainted;
            tank.inInventory = inInventory;
            tank.updatedAt = Date.now();
        }
    } else {
        const newTank = {
            id: `TNK_${Date.now()}_${Math.floor(Math.random()*1000)}`,
            sello,
            type,
            serial,
            valve,
            status,
            hydroDate,
            lastPainted,
            inInventory,
            createdAt: Date.now()
        };
        window.tankInventoryList.push(newTank);
    }

    window.closeEditTankModal();
    window.renderTankInventoryUI();
    window.saveTankInventoryDB();
};

// Delete Tank
window.deleteTank = function(tankId) {
    const tank = window.tankInventoryList.find(t => t.id === tankId);
    if (!tank) return;

    const confirmMsg = `¿Eliminar la botella Sello #${tank.sello} (Serie: ${tank.serial}) del inventario?`;
    if (typeof showAppConfirm === 'function') {
        showAppConfirm(confirmMsg, () => {
            window.tankInventoryList = window.tankInventoryList.filter(t => t.id !== tankId);
            window.renderTankInventoryUI();
            window.saveTankInventoryDB();
        });
    } else if (confirm(confirmMsg)) {
        window.tankInventoryList = window.tankInventoryList.filter(t => t.id !== tankId);
        window.renderTankInventoryUI();
        window.saveTankInventoryDB();
    }
};

// Print as PDF (Clean, condensed 35-40 tanks per A4 sheet)
window.printTankInventory = function() {
    document.body.classList.add('printing-tanks');
    window.print();
    setTimeout(() => {
        document.body.classList.remove('printing-tanks');
    }, 500);
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.initTankInventoryDB);
} else {
    window.initTankInventoryDB();
}
