
const mysql = require('mysql2/promise');
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'store_online',
});

const executeQuery = async (query, params) => {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(query, params);
    return rows;
  } finally {
    conn.release();
  }
};

// קבלת הזנות עם צירוף של לקוח עובד מוצרים
const getOrdersTech = async () => {
  try {
    let query = `
    SELECT
      o.order_ID,
      o.number,
      o.entry_date,
      o.delivery_date,
      o.placement_date,
      o.status
    FROM orders o
    GROUP BY o.order_ID, o.number, o.entry_date, o.delivery_date,o.placement_date,o.status;
  `;
    const results = await executeQuery(query);
    return results;
  } catch (error) {
    const stackTrace = error.stack;
    logErrorDetails(error, stackTrace);
  }
}
const insertOrderTech = async (eventData) => {
  try {
    const result = await executeQuery("INSERT INTO orders SET ?", eventData);
    return result;
  } catch (error) {
    const stackTrace = error.stack;
    logErrorDetails(error, stackTrace);
  }
};
const updateOrderTech = async (eventData, order_ID) => {
  try {
    const result = await executeQuery("UPDATE orders SET ? WHERE order_ID = ?", [eventData, order_ID]);
    return result;
  } catch (error) {
    console.log(error);
  }
};
const getOrders = async (order_ID = null) => {
  try {
    let query = `
      SELECT 
        o.order_ID,
        o.number,
        o.entry_date,
        o.delivery_date,
        SUM(oi.quantity) AS totalItems,
        SUM(i.price * oi.quantity) AS totalPrice,
        o.status,
        o.placement_date,
        -- ... לקוח ...
        GROUP_CONCAT(DISTINCT c.customer_ID) AS customer_ID,
        GROUP_CONCAT(DISTINCT c.first_name) AS customerFirstName,
        GROUP_CONCAT(DISTINCT c.last_name) AS customerLastName,
        GROUP_CONCAT(DISTINCT c.phone_1) AS customerPhone1,
        GROUP_CONCAT(DISTINCT c.phone_2) AS customerPhone2,
        GROUP_CONCAT(DISTINCT c.email) AS customerEmail,
        GROUP_CONCAT(DISTINCT c.city) AS customerCity,
        GROUP_CONCAT(DISTINCT c.street) AS customerStreet,
        GROUP_CONCAT(DISTINCT c.street_number) AS customerStreetNumber,
        GROUP_CONCAT(DISTINCT c.apartment) AS customerApartment,
        -- ... מוצרים ...
        GROUP_CONCAT(oi.item_ID ORDER BY oi.item_ID ASC) AS item_ID,
        GROUP_CONCAT(oi.quantity ORDER BY oi.item_ID ASC) AS itemQuantity,
        GROUP_CONCAT(oi.quantity * i.price ORDER BY oi.item_ID ASC) AS itemTotalPrice,
        GROUP_CONCAT(i.name ORDER BY oi.item_ID ASC) AS itemName,
        GROUP_CONCAT(i.description ORDER BY oi.item_ID ASC) AS itemDescription,
        GROUP_CONCAT(i.price ORDER BY oi.item_ID ASC) AS itemPrice,
        GROUP_CONCAT(i.stock ORDER BY oi.item_ID ASC) AS itemStock,
        GROUP_CONCAT(i.brand ORDER BY oi.item_ID ASC) AS itemBrand,
        GROUP_CONCAT(i.category ORDER BY oi.item_ID ASC) AS itemCategory,
        GROUP_CONCAT(i.serial ORDER BY oi.item_ID ASC) AS itemSerial,
        GROUP_CONCAT(i.img ORDER BY oi.item_ID ASC) AS itemImg,
        GROUP_CONCAT(i.active ORDER BY oi.item_ID ASC) AS itemActive,
        -- ... עובד ...
        GROUP_CONCAT(DISTINCT e.employee_ID) AS employee_ID,
        GROUP_CONCAT(DISTINCT e.first_name) AS employeeFirstName,
        GROUP_CONCAT(DISTINCT e.last_name) AS employeeLastName,
        GROUP_CONCAT(DISTINCT e.email) AS employeeEmail,
        GROUP_CONCAT(DISTINCT e.role) AS employeeRole,
        GROUP_CONCAT(DISTINCT e.phone) AS employeePhone,
        GROUP_CONCAT(DISTINCT e.active) AS employeeActive
      FROM orders o
      -- ... חיבור ...
      LEFT JOIN customer_orders co ON o.order_ID = co.order_ID
      LEFT JOIN customers c ON co.customer_ID = c.customer_ID
      LEFT JOIN order_items oi ON o.order_ID = oi.order_ID
      LEFT JOIN items i ON oi.item_ID = i.item_ID
      LEFT JOIN employee_order eo ON o.order_ID = eo.order_ID
      LEFT JOIN employees e ON eo.employee_ID = e.employee_ID
    `;

    if (order_ID) {
      query += `
        WHERE o.order_ID = ?;
      `;
      const results = await executeQuery(query, [order_ID]);
      return results;
    } else {
      query += `
        GROUP BY o.order_ID, o.number, o.entry_date, o.delivery_date;
      `;
      const results = await executeQuery(query);
      return results;
    }
  } catch (error) {
    const stackTrace = error.stack;
    logErrorDetails(error, stackTrace);
  }
};
const insertOrder = async (employee_ID, orderData, customerData, itemInserts) => {
  let conn;

  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
  
    let order_ID;
    const orderInsertResult = await executeQuery(
      'INSERT INTO orders (number, entry_date, delivery_date, status, placement_date) VALUES (?, ?, ?, ?, ?)',
      [orderData.number, orderData.entry_date, orderData.delivery_date, orderData.status, orderData.placement_date]
    );
  
    if (orderInsertResult !== false) {
      order_ID = orderInsertResult.insertId;
      console.log(order_ID)
    } else {
      throw new Error('Failed to insert order');
    }
  
    for (const itemInsert of itemInserts) {
      try {
        if (itemInsert.quantity > 0) {
          await executeQuery(
            'INSERT INTO order_items (order_ID, item_ID, quantity) VALUES (?, ?, ?)',
            [order_ID, itemInsert.item_ID, itemInsert.quantity]
          );
        }
      } catch (error) {
        console.error('Error executing SQL query for order items:', error);
        throw new Error('Failed to insert order items');
      }
    }
  
    let customer_ID;
    let customerInsertResult;
    if (Object.values(customerData).some((value) => value !== null)) {
      customerInsertResult = await executeQuery(
        'INSERT INTO customers SET ?',
        customerData
      );
  
      if (customerInsertResult !== false) {
        customer_ID = customerInsertResult.insertId;
      } else {
        throw new Error('Failed to insert customer');
      }
    }
  
    await executeQuery(
      'INSERT INTO customer_orders (customer_ID, order_ID) VALUES (?, ?)',
      [customer_ID, order_ID]
    );
  
    await executeQuery(
      'INSERT INTO employee_order (order_ID, employee_ID) VALUES (?, ?)',
      [order_ID, employee_ID]
    );
  
    await conn.commit();
    conn.release();
  
    return { success: true, message: 'Insert successful' };
  } catch (error) {
    const stackTrace = error.stack;
    logErrorDetails(error, stackTrace);
    if (conn) {
      await conn.rollback();
      conn.release();
    }
  }
  
}
const updateOrder = async (order_ID, orderData, employee_ID, customerData, itemUpdates, isEmployeeOrder) => {
  let conn;

  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    await executeQuery(
      'UPDATE orders SET number = ?, entry_date = ?, delivery_date = ?, status = ?, placement_date = ? WHERE order_ID = ?',
      [orderData.number, orderData.entry_date, orderData.delivery_date, orderData.status, orderData.placement_date, order_ID]
    );

    if (!isEmployeeOrder) {
      await executeQuery(
        'UPDATE employee_order SET employee_ID = ? WHERE order_ID = ?',
        [employee_ID, order_ID]
      );
    }

    if (customerData.customer_ID) {
      await executeQuery(
        'UPDATE customers SET first_name = ?, last_name = ?, phone_1 = ?, phone_2 = ?, email = ?, city = ?, street = ?, street_number = ?, apartment = ?, lon = ?, lat = ? WHERE customer_ID = ?',
        [customerData.first_name, customerData.last_name, customerData.phone_1, customerData.phone_2, customerData.email, customerData.city, customerData.street, customerData.street_number, customerData.apartment, customerData.lon, customerData.lat,  customerData.customer_ID]
      );
    }

    await executeQuery('DELETE FROM order_items WHERE order_ID = ?', [order_ID]);

    for (const itemUpdate of itemUpdates) {
      try {
        if (itemUpdate.quantity > 0) {
          await executeQuery(
            'INSERT INTO order_items (order_ID, item_ID, quantity) VALUES (?, ?, ?)',
            [order_ID, itemUpdate.item_ID, itemUpdate.quantity]
          );
        }
      } catch (error) {
        console.error('Error executing SQL query for order items:', error);
      }
    }

    await conn.commit();
    conn.release();

    return { success: true, message: 'Order updated successfully' };
  } catch (error) {
    await conn.rollback();
    console.error('An error occurred:', error);
    return { success: false, message: 'Error updating order' };
  }
};

// קבלת טבלה מוצר הזמנה 
const getOrderItemsTech = async (order_ID) => {
  try {
    let query = `
    SELECT
      o.order_ID,
      o.number,
      GROUP_CONCAT(oi.item_ID ORDER BY oi.item_ID ASC) AS item_ID,
      GROUP_CONCAT(i.name ORDER BY oi.item_ID ASC) AS item_name,
      GROUP_CONCAT(oi.quantity ORDER BY oi.item_ID ASC) AS quantity
    FROM orders o
    INNER JOIN order_items oi ON o.order_ID = oi.order_ID
    INNER JOIN items i ON oi.item_ID = i.item_ID
    WHERE o.order_ID = ?
    GROUP BY o.order_ID, o.number;
    `;
    const results = await executeQuery(query, [order_ID]);
    return results;
  } catch (error) {
    const stackTrace = error.stack;
    logErrorDetails(error, stackTrace);
  }
}
const deleteOrderItemsTech = async (item_ID, order_ID) => {
  try {
    const query = `
      DELETE FROM order_items
      WHERE item_ID = ? AND order_ID = ?;
    `;
    await executeQuery(query, [item_ID, order_ID]);
  } catch (error) {
    const stackTrace = error.stack;
    logErrorDetails(error, stackTrace);
  }
};
const deleteOrderItemsTechAll = async (order_ID) => {
  try {
    const query = `
      DELETE FROM order_items
      WHERE order_ID = ?;
    `;
    await executeQuery(query, [order_ID]);
  } catch (error) {
    const stackTrace = error.stack;
    logErrorDetails(error, stackTrace);
  }
};
// קבלת מוצרים עם מפתחות
const getItems = async (item_ID = null) => {
  try {
    let query = `
      SELECT
        i.item_ID,
        i.name,
        i.description,
        i.price,
        i.stock,
        i.brand,
        i.category,
        i.serial,
        i.img,
        i.active,
        GROUP_CONCAT(co.customer_ID) AS customer_IDs,
        GROUP_CONCAT(CONCAT(c.first_name, ' ', c.last_name)) AS CustomerName,
        GROUP_CONCAT(eo.employee_ID) AS employee_IDs,
        GROUP_CONCAT(oi.order_ID) AS order_IDs,
        GROUP_CONCAT(CONCAT(e.first_name, ' ', e.last_name)) AS EmployeeName,
        GROUP_CONCAT(o.number) AS orderNumbers,
        GROUP_CONCAT(o.status) AS orderStatuses
      FROM items i
      LEFT JOIN order_items oi ON i.item_ID = oi.item_ID
      LEFT JOIN customer_orders co ON oi.order_ID = co.order_ID
      LEFT JOIN employee_order eo ON oi.order_ID = eo.order_ID
      LEFT JOIN employees e ON eo.employee_ID = e.employee_ID
      LEFT JOIN customers c ON co.customer_ID = c.customer_ID
      LEFT JOIN orders o ON oi.order_ID = o.order_ID
    `;
    if (item_ID) {
      query += `
        WHERE i.item_ID = ?;
      `;

      const results = await executeQuery(query, [item_ID]);
      return results;
    } else {
      query += `
        GROUP BY i.item_ID, i.name, i.description, i.price, i.stock, i.brand, i.category, i.serial, i.img, i.active;
      `;

      const results = await executeQuery(query);
      return results;
    }
  } catch (error) {
    console.log(error);
  }
};
const getItemsTech = async () => {
  try {
    let query = `
    SELECT
      i.item_ID,
      i.name,
      i.description,
      i.price,
      i.stock,
      i.brand,
      i.category,
      i.serial,
      i.img,
      i.active
    FROM items i
    GROUP BY i.item_ID, i.name, i.description, i.price, i.stock, i.brand, i.category, i.serial, i.img, i.active;
    `;
    const results = await executeQuery(query);
    return results;
  } catch (error) {
    console.log(error);
  }
}
const insertItemTech = async (eventData) => {
  try {
    const result = await executeQuery("INSERT INTO items SET ?", eventData);
    return result;
  } catch (error) {
    console.log(error);
  }
};
const updateItemTech = async (eventData, item_ID) => {
  try {
    const result = await executeQuery("UPDATE items SET ? WHERE item_ID = ?", [eventData, item_ID]);
    return result;
  } catch (error) {
    console.log(error);
  }
};

// קבלת לקוחות עם מפתחות   
const getCustomers = async (customer_ID = null) => {
  try {
    let query = `
      SELECT
        c.customer_ID,
        c.first_name,
        c.last_name,
        c.phone_1,
        c.phone_2,
        c.email,
        c.city,
        c.street,
        c.street_number,
        c.apartment,
        c.lon,
        c.lat,
        GROUP_CONCAT( co.order_ID) AS order_IDs,
        GROUP_CONCAT(oi.item_ID) AS item_IDs,
        GROUP_CONCAT(e.employee_ID) AS employee_IDs,
        GROUP_CONCAT(o.number) AS orderNumbers,
        GROUP_CONCAT(o.status) AS orderStatuses,
        GROUP_CONCAT(i.name) AS itemNames,
        GROUP_CONCAT(CONCAT(e.first_name, ' ', e.last_name)) AS EmployeeNames
      FROM customers c
      LEFT JOIN customer_orders co ON c.customer_ID = co.customer_ID
      LEFT JOIN order_items oi ON co.order_ID = oi.order_ID
      LEFT JOIN employee_order eo ON oi.order_ID = eo.order_ID
      LEFT JOIN employees e ON eo.employee_ID = e.employee_ID
      LEFT JOIN orders o ON eo.order_ID = o.order_ID
      LEFT JOIN items i ON oi.item_ID = i.item_ID
    `;

    if (customer_ID !== null) {
      query += " WHERE c.customer_ID = ?";
    }

    query += `
      GROUP BY c.customer_ID, c.first_name, c.last_name, c.phone_1, c.phone_2, c.email, c.city, c.street, c.street_number, c.apartment, c.lon, c.lat;
    `;

    const results = await executeQuery(query, [customer_ID]);
    return results;
  } catch (error) {
    console.log(error);
  }
};
const getCustomersTech = async () => {
  try {
    let query = `
    SELECT
      c.customer_ID,
      c.first_name,
      c.last_name,
      c.phone_1,
      c.phone_2,
      c.email,
      c.city,
      c.street,
      c.street_number,
      c.apartment,
      c.lon,
      c.lat
    FROM customers c
    GROUP BY c.customer_ID, c.first_name, c.last_name, c.phone_1, c.phone_2, c.email, c.city, c.street, c.street_number, c.apartment, c.lon, c.lat;
    `;
    const results = await executeQuery(query);
    return results;
  } catch (error) {
    console.log(error);
  }
}
const insertCustomerTech = async (eventData) => {
  try {
    const result = await executeQuery("INSERT INTO customers SET ?", eventData);
    return result;
  } catch (error) {
    console.log(error);
  }
};
const updateCustomerTech = async (eventData, customer_ID) => {
  try {
    const result = await executeQuery("UPDATE customers SET ? WHERE customer_ID = ?", [eventData, customer_ID]);
    return result;
  } catch (error) {
    const stackTrace = error.stack;
    logErrorDetails(error, stackTrace);
  }
};

// קבלת טבלה לקוח הזמנה 
const getCustomerOrdersTech = async (customer_ID, order_ID) => {
  try {
    let query = `
    SELECT
      oc.customer_ID,
      oc.order_ID,
      CONCAT(c.first_name, ' ', c.last_name) AS customer_name
    FROM customer_orders oc
    INNER JOIN customers c ON oc.customer_ID = c.customer_ID
    WHERE oc.customer_ID = ? AND oc.order_ID = ?
    GROUP BY oc.customer_ID, oc.order_ID, customer_name;
    `;
    const results = await executeQuery(query, [customer_ID, order_ID]);
    return results;
  } catch (error) {
    const stackTrace = error.stack;
    logErrorDetails(error, stackTrace);
  }
}
const deleteCustomerOrdersTech = async (order_ID) => {
  try {
    const query = `
      DELETE FROM customer_orders
      WHERE order_ID = ?;
    `;
    await executeQuery(query, [order_ID]);
  } catch (error) {
    const stackTrace = error.stack;
    logErrorDetails(error, stackTrace);
  }
};
// קבלת עובדים עם מפתחות  
const getEmployees = async (employee_ID = null) => {
  try {
    let query = `
      SELECT
        e.employee_ID,
        e.first_name,
        e.last_name,
        e.email,
        e.role,
        e.phone,
        e.password,
        e.active,
        e.avatar,
        GROUP_CONCAT(eo.order_ID) AS order_IDs,
        GROUP_CONCAT(oi.item_ID) AS item_IDs,
        GROUP_CONCAT(co.customer_ID) AS customer_IDs,
        GROUP_CONCAT(o.number) AS orderNumbers,
        GROUP_CONCAT(o.status) AS orderStatuses,
        GROUP_CONCAT(i.name) AS itemNames,
        GROUP_CONCAT(CONCAT(c.first_name, ' ', c.last_name)) AS CustomerNames
      FROM employees e
      LEFT JOIN employee_order eo ON e.employee_ID = eo.employee_ID
      LEFT JOIN order_items oi ON eo.order_ID = oi.order_ID
      LEFT JOIN customer_orders co ON eo.order_ID = co.order_ID
      LEFT JOIN orders o ON eo.order_ID = o.order_ID
      LEFT JOIN items i ON oi.item_ID = i.item_ID
      LEFT JOIN customers c ON co.customer_ID = c.customer_ID
    `;
    
    if (employee_ID !== null) {
      query += " WHERE e.employee_ID = ?";
    }
    
    query += `
      GROUP BY e.employee_ID, e.first_name, e.last_name, e.email, e.role, e.phone, e.password, e.active, e.avatar;
    `;

    const results = await executeQuery(query, [employee_ID]);
    return results;
  } catch (error) {
    console.log(error);
  }
};
const getEmployeesTech = async () => {
  try {
    let query = `
    SELECT
      employee_ID, 
      first_name, 
      last_name, 
      email, 
      role, 
      phone, 
      password, 
      active, 
      avatar
    FROM employees e
    GROUP BY e.employee_ID, e.first_name, e.last_name, e.email, e.role, e.phone, e.password, e.active, e.avatar;
    `;
    const results = await executeQuery(query);
    return results;
  } catch (error) {
    console.log(error);
  }
}
const insertEmployeeTech = async (eventData) => {
  try {
    const result = await executeQuery("INSERT INTO employees SET ?", eventData);
    return result;
  } catch (error) {
    console.log(error);
  }
};
const updateEmployeeTech = async (eventData, employee_ID) => {
  try {
    const result = await executeQuery("UPDATE employees SET ? WHERE employee_ID = ?", [eventData, employee_ID]);
    return result;
  } catch (error) {
    const stackTrace = error.stack;
    logErrorDetails(error, stackTrace);
  }
};
const getLinkingTables = async () => {
  try {
    const query = `
      SELECT
        o.order_ID,
        o.number,
        o.entry_date,
        oi.item_ID,
        oi.quantity,
        i.name AS item_name,
        i.serial AS serial,
        oc.customer_ID,
        CONCAT(c.first_name, ' ', c.last_name) AS customer_name,
        eo.employee_ID,
        CONCAT(e.first_name, ' ', e.last_name) AS employee_name
      FROM orders o
      INNER JOIN order_items oi ON o.order_ID = oi.order_ID
      INNER JOIN items i ON oi.item_ID = i.item_ID
      LEFT JOIN customer_orders oc ON o.order_ID = oc.order_ID
      LEFT JOIN customers c ON oc.customer_ID = c.customer_ID
      LEFT JOIN employee_order eo ON o.order_ID = eo.order_ID
      LEFT JOIN employees e ON eo.employee_ID = e.employee_ID
      GROUP BY
        o.order_ID,
        o.number,
        o.entry_date,
        oi.item_ID,
        oi.quantity,
        i.name,
        i.serial,
        oc.customer_ID,
        customer_name,
        eo.employee_ID,
        employee_name;
    `;
    const results = await executeQuery(query);
    return results;
  } catch (error) {
    const stackTrace = error.stack;
    logErrorDetails(error, stackTrace);
  }
};

// קבלת טבלה לקוח הזמנה 
const getEmployeeOrderTech = async (employee_ID, order_ID) => {
  try {
    let query = `
    SELECT
      eo.employee_ID,
      eo.order_ID,
      CONCAT(e.first_name, ' ', e.last_name) AS employee_name
    FROM employee_order eo
    INNER JOIN employees e ON eo.employee_ID = e.employee_ID
    WHERE eo.employee_ID = ? AND eo.order_ID = ?
    GROUP BY eo.employee_ID, eo.order_ID, employee_name;
    `;
    const results = await executeQuery(query, [employee_ID, order_ID]);
    return results;
  } catch (error) {
    const stackTrace = error.stack;
    logErrorDetails(error, stackTrace);
  }
}
const deleteEmployeeOrderTech = async (order_ID) => {
  try {
    const query = `
      DELETE FROM employee_order
      WHERE order_ID = ?;
    `;
    await executeQuery(query, [order_ID]);
  } catch (error) {
    const stackTrace = error.stack;
    logErrorDetails(error, stackTrace);
  }
};

const getMessagesEmployee = async (employee_ID) => {
  try {
    const sentMessagesQuery = `
      SELECT
        m.message_ID,
        ms.sender_employee_ID,
        m.message_text,
        m.send_date,
        ms.flag,
        ms.active,
        m.titel,
        GROUP_CONCAT(CONCAT(er.first_name) SEPARATOR ', ') AS name,
        'sent' AS message_type
      FROM messages_sender AS ms
      JOIN messages AS m ON ms.message_ID = m.message_ID
      JOIN employees AS es ON ms.sender_employee_ID = es.employee_ID
      JOIN message_receivers AS mr ON m.message_ID = mr.message_ID
      JOIN employees AS er ON mr.receiver_employee_ID = er.employee_ID
      WHERE ms.sender_employee_ID = ?
      GROUP BY m.message_ID
    `;

    const receivedMessagesQuery = `
      SELECT
        m.message_ID,
        mr.receiver_employee_ID,
        ms.sender_employee_ID,
        m.message_text,
        m.send_date,
        m.titel,
        'received' AS message_type,
        mr.flag,
        mr.active,
        CONCAT(es.first_name, ' ', es.last_name) AS name
      FROM message_receivers AS mr
      JOIN messages_sender AS ms ON mr.message_ID = ms.message_ID
      JOIN messages AS m ON ms.message_ID = m.message_ID
      JOIN employees AS er ON mr.receiver_employee_ID = er.employee_ID
      JOIN employees AS es ON ms.sender_employee_ID = es.employee_ID
      WHERE mr.receiver_employee_ID = ?
    `;
  
    const [sentMessages, receivedMessages] = await Promise.all([
      executeQuery(sentMessagesQuery, [employee_ID]),
      executeQuery(receivedMessagesQuery, [employee_ID]),
    ]);

    const allMessages = {
      sentMessages: sentMessages,
      receivedMessages: receivedMessages,
    };

    return allMessages;
  } catch (error) {
    console.log(error);
  }
};

const updateMessageState = async (message_ID, newActiveValue) => {
  try {
    const resultSenderPromise = executeQuery(
      "UPDATE messages_sender SET active = ? WHERE message_ID = ?",
      [newActiveValue, message_ID]
    );
    
    const resultReceiverPromise = executeQuery(
      "UPDATE message_receivers SET active = ? WHERE message_ID = ?",
      [newActiveValue, message_ID]
    );

    const [resultSender, resultReceiver] = await Promise.all([resultSenderPromise, resultReceiverPromise]);
    return { resultSender, resultReceiver };
  } catch (error) {
    console.log(error);
  }
};

const updateMessageStatus = async (message_ID, newFlagValue) => {
  try {
    const resultReceiverPromise = executeQuery(
      "UPDATE message_receivers SET flag = ? WHERE message_ID = ?",
      [newFlagValue, message_ID]
    );
    
    const resultSenderPromise = executeQuery(
      "UPDATE messages_sender SET flag = ? WHERE message_ID = ?",
      [newFlagValue, message_ID]
    );

    const [resultReceiver, resultSender] = await Promise.all([resultReceiverPromise, resultSenderPromise]);
    return { resultReceiver, resultSender };
  } catch (error) {
    console.log(error);
  }
};

const insertMessage = async (messageData, receiversData) => {
  try {
    const messageResult = await executeQuery("INSERT INTO messages SET ?", {
      message_text: messageData.message_text,
      titel: messageData.titel,
      send_date: messageData.send_date,
    });
    const messageId = messageResult.insertId;

    const senderResult = await executeQuery("INSERT INTO messages_sender SET ?", {
      message_ID: messageId,
      sender_employee_ID: messageData.sender_employee_ID,
      flag: 0,
      active: 1,
    });

    for (const receiverData of receiversData) {
      const receiverResult = await executeQuery("INSERT INTO message_receivers SET ?", {
        message_ID: messageId,
        receiver_employee_ID: receiverData.receiver_employee_ID,
        flag: 0,
        active: 1,
      });
    }
    return messageId;
  } catch (error) {
    console.log(error);
  }
};

// Function to retrieve notes with employee names and roles
const getNotes = async () => {
  try {
      const results = await executeQuery(`
          SELECT employee_note.note_ID, employee_note.titel, employee_note.text,employee_note.at_date,
                 employee_note.to_date, employees.first_name, employees.last_name, employees.role
          FROM employee_note
          JOIN employees ON employee_note.employee_ID = employees.employee_ID
          ORDER BY employee_note.to_date DESC
      `);
      return results;
  } catch (error) {
      console.log(error);
  }
};

// Function to insert a new note
const insertNote = async (noteData) => {
  try {
      const result = await executeQuery('INSERT INTO employee_note SET ?', noteData);
      return result;
  } catch (error) {
      console.log(error);
  }
};

// Function to delete a note by note_ID
const deleteNote = async (note_ID) => {
  try {
      const result = await executeQuery('DELETE FROM employee_note WHERE note_ID = ?', note_ID);
      return result;
  } catch (error) {
      console.log(error);
  }
};


module.exports = { 
  getItems, 
  getItemsTech,
  insertItemTech,
  updateItemTech,

  getOrdersTech,
  insertOrderTech,
  updateOrderTech,
  getOrders,
  insertOrder,
  updateOrder,

  getOrderItemsTech,
  deleteOrderItemsTech,
  deleteOrderItemsTechAll,

  getCustomers,
  getCustomersTech,
  insertCustomerTech,
  updateCustomerTech,

  getCustomerOrdersTech,
  deleteCustomerOrdersTech,

  getEmployees,
  getEmployeesTech,
  insertEmployeeTech,
  updateEmployeeTech,

  getEmployeeOrderTech,
  deleteEmployeeOrderTech,

  getLinkingTables,

  getMessagesEmployee,
  insertMessage,
  updateMessageState,
  updateMessageStatus,

  getNotes,
  insertNote,
  deleteNote,
};
