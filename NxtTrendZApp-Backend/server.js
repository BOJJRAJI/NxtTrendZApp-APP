const express = require('express')
const app = express()
const cors = require('cors')
const path = require('path')
const dbPath = path.join(__dirname, './data.db')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const bcrypt = require('bcrypt')
app.use(express.json())
app.use(cors())
let db = null
const jwt = require('jsonwebtoken')

const connectDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(9000, () => {
      console.log('Server Running........')
    })
  } catch (e) {
    console.log(`Error:${e.message}`)
  }
}

connectDBAndServer()

const authenticateUser = (req, res, next) => {
  try {
    let jwtToken
    const authHeader = req.headers['authorization']
    if (authHeader !== undefined) {
      jwtToken = authHeader.split(' ')[1]
    }

    if (jwtToken === undefined) {
      res.status(401)
      res.send('Invalid JWT Token')
    } else {
      jwt.verify(jwtToken, 'MY_ACCESS_TOKEN', async (error, payLoad) => {
        if (error) {
          res.status(401)
          res.send('Invalid JWT Token')
        } else {
          const {email} = payLoad
          req.email = email
          next()
        }
      })
    }
  } catch (e) {
    res.status(500)
    res.send('Server Error')
  }
}

app.post('/register', async (req, res) => {
  try {
    const {username, email, password} = req.body
    const userQuery = `SELECT * FROM user WHERE email='${email}';`
    const userDb = await db.get(userQuery)
    if (userDb !== undefined) {
      res.status(400)
      res.json('User Already Exists')
    } else {
      const hashedPassword = await bcrypt.hash(password, 10)
      const addUserQuery = `INSERT INTO USER (username,email,password) 
            VALUES (
               '${username}',
               '${email}',
               '${hashedPassword}'
            )
            ;`
      await db.run(addUserQuery)
      res.status(200)
      res.json('User Registered Successfully')
    }
  } catch (e) {
    res.status(500)
    res.json('Server Error')
  }
})

app.post('/login', async (req, res) => {
  const {email, password} = req.body
  try {
    const userQuery = `SELECT * FROM USER WHERE email='${email}';`
    const userDb = await db.get(userQuery)
    if (userDb === undefined) {
      res.status(400)
      res.json('User Not Registered')
    } else {
      const isPasswordMatched = await bcrypt.compare(password, userDb.password)
      if (isPasswordMatched === true) {
        const payLoad = {email}
        const jwtToken = await jwt.sign(payLoad, 'MY_ACCESS_TOKEN')
       res.status(200)
        res.json({jwtToken})
      } else {
        res.status(400)
        res.json('Invalid Password')
      }
    }
  } catch (e) {
    res.status(500)
    res.json('Server Error')
  }
})


app.get('/prime-deals', authenticateUser, async (req, res) => {
  try {
    const query = `SELECT * FROM product where category="Deals";`;
    const result = await db.all(query)
    res.status(200)
    res.json(result)
  } catch (e) {
    res.status(500)
    res.send('Server Error')
  }
})

app.get('/products/',authenticateUser, async (req, res) => {
  try{
  const {
    sort_by = '',
    category = '',
    title_search = '',
    rating = '',
  } = req.query
  let orderType = 'ASC'
  
  if (sort_by === 'PRICE_HIGH') {
    orderType = 'DESC'
  }
  
  const getProductsQury=`
  SELECT * FROM PRODUCT 
  WHERE category like '%${category}%' and title like '%${title_search}%' and rating >= '${rating}'
  order by price ${orderType}
  ;
  `
  const productsArray = await db.all(getProductsQury)
  res.status(200)
  res.json(productsArray)
}catch (e) {
    res.status(500)
    res.send('Server Error')
  }
})

app.get('/products/:productId/', authenticateUser, async (req, res) => {
  try {
    const {productId} = req.params
    const productQuery = `SELECT * FROM product where id=${productId};`
    const productQueryRes = await db.get(productQuery)
    const availability = 'In Stock'
    const similarProductsQuery = `
    SELECT * FROM product where id not like ${productId} and  category='${productQueryRes.category}' and availability='${availability}';
    `
    const similarProductsQueryRes = await db.all(similarProductsQuery)
    const products = {
      ...productQueryRes,
      similar_products: similarProductsQueryRes,
    }
    res.status(200)
    res.send(products)
  } catch (e) {
    res.status(500)
    res.send('Server Error')
  }
})

app.post("/addCart",authenticateUser,async(req,res)=>{
  try{
  const {id,title,brand,price,rating,totalReviews,description,availability,imageUrl,quantity}=req.body;
  const email=req.email;
  const cartUserItemQuery=`SELECT * FROM cart where email='${email}' and id=${id};`;
  const cartUserItemQueryRes=await db.get(cartUserItemQuery);
  let cartQuery='';
  if(cartUserItemQueryRes===undefined){
      cartQuery=`INSERT INTO cart (email,id,title,brand,price,rating,total_reviews,description,availability,image_url,quantity)
      VALUES (
        '${email}',
        ${id},
        '${title}',
        '${brand}',
        ${price},
        '${rating}',
        ${totalReviews},
        '${description}',
        '${availability}',
        '${imageUrl}',
        ${quantity}
      )
      ;`;
  }
  else{
    const upadtedQuantity=quantity+cartUserItemQueryRes.quantity
    cartQuery=`UPDATE cart SET quantity=${upadtedQuantity} where  email='${email}' and id=${id}`
  }
  await db.run(cartQuery);
  res.status(200);
  res.json("Item Added To Cart!");
  }
  catch (e) {
    res.status(500)
    res.send('Server Error')
  }
})

app.get("/user/cartitems",authenticateUser,async(req,res)=>{
  try{
  const email=req.email;
  const userCartItemsQuery=`SELECT * from cart where email='${email}';`;
  const items=await db.all(userCartItemsQuery);
  res.status(200);
  res.json(items);
  }
catch (e) {
    res.status(500)
    res.send('Server Error')
  }
})

app.delete("/itemdelete/:id/",authenticateUser,async(req,res)=>{
  try{
  const email=req.email;
  const {id}=req.params;
  const deleteQuery=`DELETE FROM cart
  WHERE email='${email}' and id=${id}; `;
  await db.run(deleteQuery);
  res.status(200);
  res.json("Item Removed From Cart!");
}catch (e) {
    res.status(500)
    res.send('Server Error')
  }
})

app.delete("/emptycart/",authenticateUser,async(req,res)=>{
  try{
    const email=req.email;
    const deleteQuery=`DELETE FROM cart
    WHERE email='${email}'`;
    await db.run(deleteQuery);
    res.status(200);
    res.json("Successfully removed all items in Cart!");
  }catch (e) {
      res.status(500)
      res.send('Server Error')
    }
})

app.get('/cart/:id',authenticateUser,async(req,res)=>{
  try{
  const {id}=req.params;
  const email=req.email;
  const getCartItemQuery=`SELECT * FROM cart where email='${email}' and id=${id};`;
  const getCartItemQueryRes=await db.get(getCartItemQuery)
  res.status(200);
  res.json(getCartItemQueryRes)
}catch (e) {
  res.status(500)
  res.json('Unable to update')
}
})

app.put("/cartupdate/:id",authenticateUser,async(req,res)=>{
  try{
    const {quantity}=req.body;
    const email=req.email;
    const {id}=req.params
    const updateQuery=`
    UPDATE cart SET quantity=${quantity} where email='${email}' and id=${id};
    `;
    await db.run(updateQuery);
    res.status(200)
  res.json("Updated")

  }catch(e){
    res.status(500)
  res.json(e.message)
  }
})

